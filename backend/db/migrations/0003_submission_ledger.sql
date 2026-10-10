-- 7B.4B laboratory persistence only. No executor, network, HTTP route or frontend binding.
CREATE TABLE submission_orders (
 organization_id uuid NOT NULL REFERENCES organizations(id), order_id uuid NOT NULL DEFAULT gen_random_uuid(),
 origin_local_order_id text NOT NULL CHECK(length(origin_local_order_id) BETWEEN 1 AND 128), owner_id uuid NOT NULL,
 order_revision integer NOT NULL DEFAULT 0 CHECK(order_revision>=0), anchor_revision integer NOT NULL DEFAULT 1 CHECK(anchor_revision>0),
 event_sequence integer NOT NULL DEFAULT 0 CHECK(event_sequence>=0), current_submission_id uuid, accepted_submission_id uuid,
 conflict_hold boolean NOT NULL DEFAULT false, recovery_hold boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,order_id), UNIQUE(organization_id,origin_local_order_id),
 FOREIGN KEY(organization_id,owner_id) REFERENCES organization_memberships(organization_id,user_id)
);
CREATE TABLE order_submissions (
 organization_id uuid NOT NULL, order_id uuid NOT NULL, submission_id uuid NOT NULL,
 order_revision integer NOT NULL CHECK(order_revision>0), source_local_revision integer NOT NULL CHECK(source_local_revision>=0),
 snapshot_encrypted bytea NOT NULL, request_encrypted bytea NOT NULL,
 business_hash text NOT NULL CHECK(business_hash ~ '^[a-f0-9]{64}$'), request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 1048576),
 contract_version text NOT NULL CHECK(contract_version='submission-ledger-v1'), canonical_version text NOT NULL CHECK(canonical_version='legacy-order-canonical-v1'),
 mapper_version text NOT NULL CHECK(mapper_version='fixture-identity-v1'), mode text NOT NULL CHECK(mode='FIXTURE'),
 provider text NOT NULL CHECK(provider='SYNTHETIC'), target_account text NOT NULL, connection_id uuid CHECK(connection_id IS NULL), connection_generation integer NOT NULL CHECK(connection_generation=1),
 admitted_by uuid NOT NULL, state text NOT NULL CHECK(state IN ('READY','SUBMITTING','SUBMITTED','ERROR','UNKNOWN')),
 certainty text NOT NULL CHECK(certainty IN ('NO_EFFECT','REJECTED_FINAL','ACCEPTED','INCONCLUSIVE','CONFLICT')),
 ledger_revision integer NOT NULL DEFAULT 1 CHECK(ledger_revision>0), conflict_hold boolean NOT NULL DEFAULT false,
 external_order_id text, accepted_evidence_id uuid, last_evidence_id uuid, released_at timestamptz, retry_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,submission_id), UNIQUE(organization_id,order_id,submission_id),
 FOREIGN KEY(organization_id,order_id) REFERENCES submission_orders(organization_id,order_id),
 FOREIGN KEY(organization_id,admitted_by) REFERENCES organization_memberships(organization_id,user_id),
 CHECK(target_account='lab:'||organization_id::text),
 CHECK((state='SUBMITTED')=(external_order_id IS NOT NULL AND accepted_evidence_id IS NOT NULL)),
 CHECK(state<>'SUBMITTED' OR certainty='ACCEPTED'),
 CHECK(state<>'READY' OR certainty='NO_EFFECT'),
 CHECK(released_at IS NULL OR (state IN ('ERROR','SUBMITTED') AND certainty IN ('REJECTED_FINAL','ACCEPTED')))
);
CREATE UNIQUE INDEX submission_one_occupant ON order_submissions(organization_id,order_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX submission_external_unique ON order_submissions(organization_id,provider,target_account,external_order_id) WHERE external_order_id IS NOT NULL;
CREATE INDEX submission_pending ON order_submissions(organization_id,state,updated_at);
CREATE INDEX submission_history ON order_submissions(organization_id,order_id,created_at);
CREATE INDEX submission_owner ON submission_orders(organization_id,owner_id);
CREATE TABLE submission_communications (
 organization_id uuid NOT NULL, order_id uuid NOT NULL, submission_id uuid NOT NULL, operation_id uuid NOT NULL, execution_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0), kind text NOT NULL CHECK(kind IN ('CREATE','LOOKUP')),
 outcome text NOT NULL CHECK(outcome IN ('PENDING','INCONCLUSIVE','NO_EFFECT','REJECTED_FINAL','ACCEPTED','CONFLICT')),
 potential_effect boolean NOT NULL, safe_closed_at timestamptz, closed_evidence_id uuid,
 lease_until timestamptz NOT NULL, finished_at timestamptz, abandoned boolean NOT NULL DEFAULT false,
 authorized_by uuid NOT NULL, authorized_session_id uuid NOT NULL REFERENCES sessions(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,operation_id), UNIQUE(organization_id,order_id,submission_id,operation_id),
 UNIQUE(organization_id,execution_id), UNIQUE(organization_id,submission_id,sequence),
 FOREIGN KEY(organization_id,order_id,submission_id) REFERENCES order_submissions(organization_id,order_id,submission_id),
 FOREIGN KEY(organization_id,authorized_by) REFERENCES organization_memberships(organization_id,user_id),
 CHECK(kind='CREATE' OR NOT potential_effect),
 CHECK(safe_closed_at IS NULL OR (NOT potential_effect AND closed_evidence_id IS NOT NULL AND outcome IN ('NO_EFFECT','REJECTED_FINAL','ACCEPTED'))),
 CHECK(kind<>'CREATE' OR potential_effect OR safe_closed_at IS NOT NULL)
);
CREATE UNIQUE INDEX submission_one_capable ON submission_communications(organization_id,submission_id) WHERE kind='CREATE' AND (potential_effect OR outcome IN ('PENDING','INCONCLUSIVE','CONFLICT'));
CREATE UNIQUE INDEX submission_one_lookup ON submission_communications(organization_id,submission_id) WHERE kind='LOOKUP' AND finished_at IS NULL;
CREATE INDEX submission_recovery ON submission_communications(organization_id,created_at) WHERE kind='CREATE' AND potential_effect;
CREATE TABLE submission_evidence (
 organization_id uuid NOT NULL, order_id uuid NOT NULL, submission_id uuid NOT NULL, evidence_id uuid NOT NULL,
 operation_id uuid, execution_id uuid, source text NOT NULL CHECK(source='LAB_ATTESTATION'),
 conclusion text NOT NULL CHECK(conclusion IN ('ACCEPTED','REJECTED_FINAL','NO_EFFECT','INCONCLUSIVE')),
 business_hash text NOT NULL, request_hash text NOT NULL, target_account text NOT NULL, connection_generation integer NOT NULL,
 external_order_id text, checks jsonb NOT NULL, content_rejected boolean NOT NULL DEFAULT false,
 details_encrypted bytea NOT NULL, details_hash text NOT NULL CHECK(details_hash ~ '^[a-f0-9]{64}$'),
 author_id uuid NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,evidence_id), UNIQUE(organization_id,order_id,submission_id,evidence_id),
 FOREIGN KEY(organization_id,order_id,submission_id) REFERENCES order_submissions(organization_id,order_id,submission_id),
 FOREIGN KEY(organization_id,order_id,submission_id,operation_id) REFERENCES submission_communications(organization_id,order_id,submission_id,operation_id),
 FOREIGN KEY(organization_id,author_id) REFERENCES organization_memberships(organization_id,user_id),
 CHECK((conclusion='ACCEPTED')=(external_order_id IS NOT NULL)),
 CHECK((operation_id IS NULL)=(execution_id IS NULL)), CHECK(operation_id IS NOT NULL OR conclusion='NO_EFFECT')
);
CREATE TABLE submission_events (
 organization_id uuid NOT NULL, order_id uuid NOT NULL, event_id uuid NOT NULL DEFAULT gen_random_uuid(), submission_id uuid,
 sequence integer NOT NULL CHECK(sequence>0), action text NOT NULL, actor_id uuid NOT NULL, session_id uuid NOT NULL REFERENCES sessions(id),
 command_id uuid, command_digest text, command_receipt jsonb, evidence_id uuid, from_state text, to_state text,
 justification_encrypted bytea, justification_hash text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,event_id), UNIQUE(organization_id,order_id,sequence), UNIQUE(organization_id,command_id),
 FOREIGN KEY(organization_id,order_id) REFERENCES submission_orders(organization_id,order_id),
 FOREIGN KEY(organization_id,order_id,submission_id) REFERENCES order_submissions(organization_id,order_id,submission_id),
 FOREIGN KEY(organization_id,order_id,submission_id,evidence_id) REFERENCES submission_evidence(organization_id,order_id,submission_id,evidence_id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES organization_memberships(organization_id,user_id),
 CHECK((command_id IS NULL AND command_digest IS NULL AND command_receipt IS NULL) OR (command_id IS NOT NULL AND command_digest IS NOT NULL AND command_receipt IS NOT NULL)),
 CHECK(evidence_id IS NULL OR submission_id IS NOT NULL)
);
ALTER TABLE submission_orders ADD CONSTRAINT submission_current_fk FOREIGN KEY(organization_id,order_id,current_submission_id) REFERENCES order_submissions(organization_id,order_id,submission_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE submission_orders ADD CONSTRAINT submission_accepted_fk FOREIGN KEY(organization_id,order_id,accepted_submission_id) REFERENCES order_submissions(organization_id,order_id,submission_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE order_submissions ADD CONSTRAINT submission_acceptance_fk FOREIGN KEY(organization_id,order_id,submission_id,accepted_evidence_id) REFERENCES submission_evidence(organization_id,order_id,submission_id,evidence_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE order_submissions ADD CONSTRAINT submission_last_evidence_fk FOREIGN KEY(organization_id,order_id,submission_id,last_evidence_id) REFERENCES submission_evidence(organization_id,order_id,submission_id,evidence_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE submission_communications ADD CONSTRAINT submission_closure_fk FOREIGN KEY(organization_id,order_id,submission_id,closed_evidence_id) REFERENCES submission_evidence(organization_id,order_id,submission_id,evidence_id) DEFERRABLE INITIALLY DEFERRED;
REVOKE ALL ON submission_orders,order_submissions,submission_communications,submission_events,submission_evidence FROM PUBLIC;
--> statement-breakpoint
-- All mutation entrypoints are owned by the migration role, never by the runtime role.
CREATE FUNCTION submission_auth(p_session uuid,p_target uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.sessions; r text;
BEGIN
 SELECT * INTO s FROM public.sessions WHERE id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=s.organization_id AND status='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 PERFORM 1 FROM public.users WHERE id IN (s.user_id,p_target) ORDER BY id FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.users WHERE id IN (s.user_id,p_target) AND status<>'ACTIVE') THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 PERFORM 1 FROM public.organization_memberships WHERE organization_id=s.organization_id AND user_id IN (s.user_id,p_target) ORDER BY user_id FOR SHARE;
 SELECT role INTO r FROM public.organization_memberships WHERE organization_id=s.organization_id AND user_id=s.user_id AND status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 PERFORM 1 FROM public.sessions WHERE id=p_session AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 RETURN jsonb_build_object('organizationId',s.organization_id,'userId',s.user_id,'role',r);
END $$;
CREATE FUNCTION submission_projection(p_org uuid,p_order uuid,p_sub uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('orderId',o.order_id,'orderRevision',o.order_revision,'anchorRevision',o.anchor_revision,'ownerId',o.owner_id,
 'currentSubmissionId',o.current_submission_id,'acceptedSubmissionId',o.accepted_submission_id,'conflictHold',o.conflict_hold,'recoveryHold',o.recovery_hold,
 'submission',CASE WHEN s.submission_id IS NULL THEN NULL ELSE jsonb_build_object('submissionId',s.submission_id,'state',s.state,'certainty',s.certainty,'ledgerRevision',s.ledger_revision,
 'businessHash',s.business_hash,'requestHash',s.request_hash,'account',s.target_account,'generation',s.connection_generation,'releasedAt',s.released_at,'externalId',s.external_order_id,'conflictHold',s.conflict_hold) END)
 FROM public.submission_orders o LEFT JOIN public.order_submissions s ON s.organization_id=o.organization_id AND s.order_id=o.order_id AND s.submission_id=coalesce(p_sub,o.current_submission_id)
 WHERE o.organization_id=p_org AND o.order_id=p_order
$$;
CREATE FUNCTION submission_read(p_session uuid,p_order uuid,p_sub uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; o public.submission_orders; s public.order_submissions;
BEGIN
 a:=public.submission_auth(p_session);
 SELECT * INTO o FROM public.submission_orders WHERE organization_id=(a->>'organizationId')::uuid AND order_id=p_order FOR UPDATE;
 IF NOT FOUND OR (a->>'role'<>'ADMIN' AND o.owner_id<>(a->>'userId')::uuid) THEN RAISE EXCEPTION 'RESOURCE_UNAVAILABLE'; END IF;
 SELECT * INTO s FROM public.order_submissions WHERE organization_id=o.organization_id AND order_id=o.order_id AND submission_id=coalesce(p_sub,o.current_submission_id) FOR UPDATE;
 RETURN jsonb_build_object('projection',public.submission_projection(o.organization_id,o.order_id,p_sub),'origin',o.origin_local_order_id,
 'snapshot',convert_from(s.snapshot_encrypted,'UTF8'),'request',convert_from(s.request_encrypted,'UTF8'),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY sequence),'[]') FROM public.submission_events e WHERE e.organization_id=o.organization_id AND e.order_id=o.order_id),
 'evidence',(SELECT coalesce(jsonb_agg(to_jsonb(e)-'details_encrypted' || jsonb_build_object('envelope',convert_from(e.details_encrypted,'UTF8'))),'[]') FROM public.submission_evidence e WHERE e.organization_id=o.organization_id AND e.order_id=o.order_id AND e.submission_id=s.submission_id),
 'communications',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY sequence),'[]') FROM public.submission_communications c WHERE c.organization_id=o.organization_id AND c.order_id=o.order_id AND c.submission_id=s.submission_id));
END $$;
REVOKE ALL ON FUNCTION submission_auth(uuid,uuid),submission_projection(uuid,uuid,uuid),submission_read(uuid,uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION submission_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'IMMUTABLE_LEDGER'; END IF;
 IF TG_TABLE_NAME='submission_evidence' AND current_setting('atram.rotation',true)='verified-maintenance' AND (to_jsonb(NEW)-'details_encrypted')=(to_jsonb(OLD)-'details_encrypted') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME IN ('submission_events','submission_evidence') THEN RAISE EXCEPTION 'IMMUTABLE_LEDGER'; END IF;
 IF TG_TABLE_NAME='submission_communications' AND (to_jsonb(NEW)-ARRAY['outcome','potential_effect','safe_closed_at','closed_evidence_id','lease_until','finished_at','abandoned']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['outcome','potential_effect','safe_closed_at','closed_evidence_id','lease_until','finished_at','abandoned']) THEN RAISE EXCEPTION 'IMMUTABLE_COMMUNICATION'; END IF;
 IF TG_TABLE_NAME='submission_orders' THEN
  IF (NEW.organization_id,NEW.order_id,NEW.origin_local_order_id,NEW.created_at) IS DISTINCT FROM (OLD.organization_id,OLD.order_id,OLD.origin_local_order_id,OLD.created_at) THEN RAISE EXCEPTION 'IMMUTABLE_LEDGER'; END IF;
 END IF;
 IF TG_TABLE_NAME='order_submissions' THEN
  IF current_setting('atram.rotation',true)='verified-maintenance' AND (to_jsonb(NEW)-ARRAY['snapshot_encrypted','request_encrypted'])=(to_jsonb(OLD)-ARRAY['snapshot_encrypted','request_encrypted']) THEN RETURN NEW; END IF;
  IF NOT (CASE OLD.state WHEN 'READY' THEN NEW.state IN ('READY','SUBMITTING','ERROR') WHEN 'SUBMITTING' THEN NEW.state IN ('SUBMITTING','SUBMITTED','ERROR','UNKNOWN') WHEN 'SUBMITTED' THEN NEW.state='SUBMITTED' WHEN 'ERROR' THEN NEW.state IN ('ERROR','SUBMITTING','SUBMITTED','UNKNOWN') WHEN 'UNKNOWN' THEN NEW.state IN ('UNKNOWN','ERROR','SUBMITTED') ELSE false END) THEN RAISE EXCEPTION 'STATE_FORBIDDEN'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','certainty','ledger_revision','conflict_hold','external_order_id','accepted_evidence_id','last_evidence_id','released_at','retry_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','certainty','ledger_revision','conflict_hold','external_order_id','accepted_evidence_id','last_evidence_id','released_at','retry_at','updated_at']) THEN RAISE EXCEPTION 'IMMUTABLE_SNAPSHOT'; END IF;
  IF OLD.state='SUBMITTED' AND (NEW.state,NEW.external_order_id,NEW.accepted_evidence_id) IS DISTINCT FROM (OLD.state,OLD.external_order_id,OLD.accepted_evidence_id) THEN RAISE EXCEPTION 'TERMINAL_STATE'; END IF;
  IF OLD.released_at IS NOT NULL AND NEW.released_at IS DISTINCT FROM OLD.released_at THEN RAISE EXCEPTION 'IMMUTABLE_TOMBSTONE'; END IF;
  IF NEW.ledger_revision<OLD.ledger_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_orders_immutable BEFORE UPDATE OR DELETE ON submission_orders FOR EACH ROW EXECUTE FUNCTION submission_immutable();
CREATE TRIGGER order_submissions_immutable BEFORE UPDATE OR DELETE ON order_submissions FOR EACH ROW EXECUTE FUNCTION submission_immutable();
CREATE TRIGGER submission_events_immutable BEFORE UPDATE OR DELETE ON submission_events FOR EACH ROW EXECUTE FUNCTION submission_immutable();
CREATE TRIGGER submission_evidence_immutable BEFORE UPDATE OR DELETE ON submission_evidence FOR EACH ROW EXECUTE FUNCTION submission_immutable();
CREATE TRIGGER submission_communications_no_delete BEFORE UPDATE OR DELETE ON submission_communications FOR EACH ROW EXECUTE FUNCTION submission_immutable();
REVOKE ALL ON FUNCTION submission_immutable() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION submission_command(p_session uuid,p_command uuid,p_action text,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; org uuid; actor uuid; role_name text; o public.submission_orders; s public.order_submissions; c public.submission_communications; e public.submission_evidence; prior public.submission_events;
 oid uuid; sid uuid; op uuid; ex uuid; eid uuid; digest text; receipt jsonb; oldstate text; event_action text; conflict boolean:=false; target_owner uuid;
BEGIN
 a:=public.submission_auth(p_session,CASE WHEN p_action='OWNER' THEN (b->>'ownerId')::uuid ELSE NULL END);org:=(a->>'organizationId')::uuid;actor:=(a->>'userId')::uuid;role_name:=a->>'role';
 IF p_command IS NULL OR p_action NOT IN ('REGISTER','ADMIT','CONFIRM','ABANDON','LOOKUP','EVIDENCE','RESOLVE','ARCHIVE','OWNER','HOLD','BLOCK') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
 -- Serializes command identities including conflicts on different resources. No network in this transaction.
 PERFORM pg_advisory_xact_lock(hashtextextended(org::text||p_command::text,73441));
 digest:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'body',b-'snapshot'-'request'-'detailsEnvelope'-'recoveryEpoch'-'reasonEnvelope')::text,'UTF8')),'hex');
 oid:=(b->>'orderId')::uuid; sid:=(b->>'submissionId')::uuid;
 IF p_action='REGISTER' THEN
  IF role_name<>'OPERADOR' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  INSERT INTO public.submission_orders(organization_id,origin_local_order_id,owner_id) VALUES(org,b->>'origin',actor) ON CONFLICT(organization_id,origin_local_order_id) DO NOTHING;
  SELECT * INTO o FROM public.submission_orders WHERE organization_id=org AND origin_local_order_id=b->>'origin' FOR UPDATE;
  oid:=o.order_id;
 ELSE
  -- New owner membership is locked before the anchor. Locks on identity rows remain short.
  IF p_action='OWNER' THEN
   target_owner:=(b->>'ownerId')::uuid;
   PERFORM 1 FROM public.users WHERE id=target_owner AND status='ACTIVE' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_UNAVAILABLE'; END IF;
   PERFORM 1 FROM public.organization_memberships WHERE organization_id=org AND user_id=target_owner AND status='ACTIVE' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_UNAVAILABLE'; END IF;
  END IF;
  SELECT * INTO o FROM public.submission_orders WHERE organization_id=org AND order_id=oid FOR UPDATE;
 END IF;
 IF o.order_id IS NULL OR (role_name<>'ADMIN' AND o.owner_id<>actor) THEN RAISE EXCEPTION 'RESOURCE_UNAVAILABLE'; END IF;
 IF p_action IN ('REGISTER','ADMIT','CONFIRM') AND role_name<>'OPERADOR' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_action IN ('ABANDON','EVIDENCE','RESOLVE','ARCHIVE','OWNER','HOLD','BLOCK') AND role_name<>'ADMIN' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_action='LOOKUP' AND role_name NOT IN ('ADMIN','OPERADOR') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO prior FROM public.submission_events WHERE organization_id=org AND command_id=p_command;
 IF FOUND THEN
  IF prior.actor_id<>actor OR prior.action<>p_action OR prior.command_digest<>digest OR prior.order_id<>oid THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
  RETURN jsonb_build_object('commandReceipt',prior.command_receipt,'projection',public.submission_projection(org,oid,prior.submission_id),'replay',true);
 END IF;
 IF sid IS NOT NULL THEN
  SELECT * INTO s FROM public.order_submissions WHERE organization_id=org AND submission_id=sid FOR UPDATE;
  IF FOUND AND s.order_id<>oid THEN RAISE EXCEPTION 'IDENTITY_CONFLICT'; END IF;
  IF NOT FOUND AND p_action<>'ADMIT' THEN RAISE EXCEPTION 'RESOURCE_UNAVAILABLE'; END IF;
 END IF;
 oldstate:=s.state;
 receipt:=jsonb_build_object('commandId',p_command,'action',p_action,'orderId',oid,'result','RECORDED');
 IF sid IS NOT NULL THEN receipt:=receipt||jsonb_build_object('submissionId',sid); END IF;
 IF p_action='ADMIT' THEN
  IF coalesce(b->>'recoveryEpoch','')='' OR o.recovery_hold OR o.conflict_hold THEN RAISE EXCEPTION 'RECOVERY_HOLD'; END IF;
  IF s.submission_id IS NOT NULL THEN
   IF convert_from(s.snapshot_encrypted,'UTF8') IS DISTINCT FROM b->>'snapshot' OR convert_from(s.request_encrypted,'UTF8') IS DISTINCT FROM b->>'request'
    OR s.business_hash IS DISTINCT FROM b->>'businessHash' OR s.request_hash IS DISTINCT FROM b->>'requestHash'
    OR s.canonical_version IS DISTINCT FROM b->>'canonicalVersion' OR s.source_local_revision IS DISTINCT FROM (b->>'sourceLocalRevision')::integer THEN RAISE EXCEPTION 'IDENTITY_CONFLICT'; END IF;
   -- Existing same identity is returned only at its original admission revision.
   IF (b->>'expectedOrderRevision')::integer<>s.order_revision-1 THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
   receipt:=receipt||jsonb_build_object('result','EXISTING');
  ELSE
   IF o.current_submission_id IS NOT NULL OR o.accepted_submission_id IS NOT NULL THEN RAISE EXCEPTION 'ORDER_OCCUPIED'; END IF;
   IF o.order_revision<>(b->>'expectedOrderRevision')::integer THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
   IF o.origin_local_order_id IS DISTINCT FROM b->>'origin' THEN RAISE EXCEPTION 'IDENTITY_CONFLICT'; END IF;
   IF EXISTS(SELECT 1 FROM public.order_submissions WHERE organization_id=org AND order_id=oid AND business_hash=b->>'businessHash') THEN RAISE EXCEPTION 'CONTENT_UNCHANGED'; END IF;
   INSERT INTO public.order_submissions(organization_id,order_id,submission_id,order_revision,source_local_revision,snapshot_encrypted,request_encrypted,business_hash,request_hash,byte_length,contract_version,canonical_version,mapper_version,mode,provider,target_account,connection_generation,admitted_by,state,certainty)
    VALUES(org,oid,sid,o.order_revision+1,(b->>'sourceLocalRevision')::integer,convert_to(b->>'snapshot','UTF8'),convert_to(b->>'request','UTF8'),b->>'businessHash',b->>'requestHash',(b->>'byteLength')::integer,'submission-ledger-v1',b->>'canonicalVersion','fixture-identity-v1','FIXTURE','SYNTHETIC','lab:'||org::text,1,actor,'READY','NO_EFFECT');
   UPDATE public.submission_orders SET order_revision=order_revision+1,anchor_revision=anchor_revision+1,current_submission_id=sid WHERE organization_id=org AND order_id=oid;
  END IF;
 ELSIF p_action IN ('CONFIRM','LOOKUP','ABANDON','ARCHIVE','RESOLVE','BLOCK') THEN
  IF s.ledger_revision IS DISTINCT FROM (b->>'expectedLedgerRevision')::integer THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 END IF;
 IF p_action='CONFIRM' THEN
  IF coalesce(b->>'recoveryEpoch','')='' OR o.recovery_hold OR o.conflict_hold OR s.conflict_hold THEN RAISE EXCEPTION 'RECOVERY_HOLD'; END IF;
  IF s.released_at IS NOT NULL OR s.state='UNKNOWN' THEN RAISE EXCEPTION 'OUTCOME_BLOCKED'; END IF;
  IF s.state IN ('SUBMITTED','SUBMITTING') THEN
   SELECT * INTO c FROM public.submission_communications WHERE organization_id=org AND submission_id=sid AND kind='CREATE' ORDER BY sequence DESC LIMIT 1;
   op:=c.operation_id;ex:=c.execution_id;receipt:=receipt||jsonb_build_object('result','EXISTING');
  ELSE
   IF s.state NOT IN ('READY','ERROR') OR s.certainty NOT IN ('NO_EFFECT','REJECTED_FINAL') OR s.retry_at>clock_timestamp() THEN RAISE EXCEPTION 'OUTCOME_BLOCKED'; END IF;
   IF EXISTS(SELECT 1 FROM public.submission_communications WHERE organization_id=org AND submission_id=sid AND kind='CREATE' AND (potential_effect OR safe_closed_at IS NULL)) THEN RAISE EXCEPTION 'OUTCOME_BLOCKED'; END IF;
   op:=gen_random_uuid();ex:=gen_random_uuid();
   INSERT INTO public.submission_communications(organization_id,order_id,submission_id,operation_id,execution_id,sequence,kind,outcome,potential_effect,lease_until,authorized_by,authorized_session_id)
    SELECT org,oid,sid,op,ex,coalesce(max(sequence),0)+1,'CREATE','PENDING',true,now()+interval '30 seconds',actor,p_session FROM public.submission_communications WHERE organization_id=org AND submission_id=sid;
   UPDATE public.order_submissions SET state='SUBMITTING',certainty='INCONCLUSIVE',ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
  END IF;
 ELSIF p_action='LOOKUP' THEN
  IF s.state NOT IN ('SUBMITTING','UNKNOWN','ERROR','SUBMITTED') THEN RAISE EXCEPTION 'STATE_FORBIDDEN'; END IF;
  SELECT * INTO c FROM public.submission_communications WHERE organization_id=org AND submission_id=sid AND kind='LOOKUP' AND finished_at IS NULL;
  IF FOUND THEN op:=c.operation_id;ex:=c.execution_id;
  ELSE
   op:=gen_random_uuid();ex:=gen_random_uuid();
   INSERT INTO public.submission_communications(organization_id,order_id,submission_id,operation_id,execution_id,sequence,kind,outcome,potential_effect,lease_until,authorized_by,authorized_session_id)
    SELECT org,oid,sid,op,ex,coalesce(max(sequence),0)+1,'LOOKUP','PENDING',false,now()+interval '30 seconds',actor,p_session FROM public.submission_communications WHERE organization_id=org AND submission_id=sid;
   UPDATE public.order_submissions SET ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
  END IF;
 ELSIF p_action='ABANDON' THEN
  IF s.state<>'SUBMITTING' THEN RAISE EXCEPTION 'STATE_FORBIDDEN'; END IF;
  UPDATE public.submission_communications SET abandoned=true,finished_at=now(),outcome='INCONCLUSIVE' WHERE organization_id=org AND submission_id=sid AND kind='CREATE' AND potential_effect;
  UPDATE public.order_submissions SET state='UNKNOWN',certainty='INCONCLUSIVE',ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
 ELSIF p_action='ARCHIVE' THEN
  SELECT * INTO e FROM public.submission_evidence WHERE organization_id=org AND evidence_id=s.last_evidence_id;
  IF s.state<>'ERROR' OR s.certainty<>'REJECTED_FINAL' OR e.conclusion IS DISTINCT FROM 'REJECTED_FINAL' OR NOT e.content_rejected
   OR s.released_at IS NOT NULL OR o.conflict_hold OR s.conflict_hold OR o.recovery_hold OR o.order_revision IS DISTINCT FROM (b->>'expectedOrderRevision')::integer
   OR EXISTS(SELECT 1 FROM public.submission_communications WHERE organization_id=org AND submission_id=sid AND kind='CREATE' AND (potential_effect OR safe_closed_at IS NULL)) THEN RAISE EXCEPTION 'OUTCOME_BLOCKED'; END IF;
  UPDATE public.order_submissions SET released_at=now(),ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
  UPDATE public.submission_orders SET current_submission_id=NULL,order_revision=order_revision+1,anchor_revision=anchor_revision+1 WHERE organization_id=org AND order_id=oid;
 ELSIF p_action='BLOCK' THEN
  IF s.state<>'READY' OR EXISTS(SELECT 1 FROM public.submission_communications WHERE organization_id=org AND submission_id=sid AND kind='CREATE') THEN RAISE EXCEPTION 'STATE_FORBIDDEN'; END IF;
  eid:=(b->>'evidenceId')::uuid;
  INSERT INTO public.submission_evidence(organization_id,order_id,submission_id,evidence_id,source,conclusion,business_hash,request_hash,target_account,connection_generation,checks,details_encrypted,details_hash,author_id)
   VALUES(org,oid,sid,eid,'LAB_ATTESTATION','NO_EFFECT',s.business_hash,s.request_hash,s.target_account,s.connection_generation,'{"transportNotInvoked":true,"executionFenced":true,"preDispatch":true}'::jsonb,convert_to(b->>'detailsEnvelope','UTF8'),b->>'detailsHash',actor);
  UPDATE public.order_submissions SET state='ERROR',certainty='NO_EFFECT',last_evidence_id=eid,ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
 ELSIF p_action='OWNER' THEN
  IF o.anchor_revision IS DISTINCT FROM (b->>'expectedAnchorRevision')::integer OR length(coalesce(b->>'reasonHash',''))<>64 OR b->>'reasonEnvelope' IS NULL THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  UPDATE public.submission_orders SET owner_id=target_owner,anchor_revision=anchor_revision+1 WHERE organization_id=org AND order_id=oid;
 ELSIF p_action='HOLD' THEN
  IF o.anchor_revision IS DISTINCT FROM (b->>'expectedAnchorRevision')::integer THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  UPDATE public.submission_orders SET recovery_hold=true,anchor_revision=anchor_revision+1 WHERE organization_id=org AND order_id=oid;
 END IF;
 IF p_action IN ('EVIDENCE','RESOLVE') THEN
  eid:=(b->>'evidenceId')::uuid;
  IF p_action='EVIDENCE' THEN
   SELECT * INTO c FROM public.submission_communications WHERE organization_id=org AND order_id=oid AND submission_id=sid AND operation_id=(b->>'operationId')::uuid FOR UPDATE;
   IF NOT FOUND OR c.execution_id IS DISTINCT FROM (b->>'executionId')::uuid OR b->>'businessHash' IS DISTINCT FROM s.business_hash OR b->>'requestHash' IS DISTINCT FROM s.request_hash OR b->>'account' IS DISTINCT FROM s.target_account OR (b->>'generation')::integer IS DISTINCT FROM s.connection_generation THEN RAISE EXCEPTION 'EVIDENCE_INVALID'; END IF;
   IF b->>'conclusion'='ACCEPTED' AND (length(coalesce(b->>'externalId','')) NOT BETWEEN 1 AND 128 OR b->'checks'->>'exactBinding'<>'true') THEN RAISE EXCEPTION 'EVIDENCE_INVALID'; END IF;
   IF b->>'conclusion'='NO_EFFECT' AND (c.kind<>'CREATE' OR b->'checks'->>'transportNotInvoked' IS DISTINCT FROM 'true' OR b->'checks'->>'executionFenced' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'EVIDENCE_INVALID'; END IF;
   IF b->>'conclusion'='REJECTED_FINAL' AND (b->'checks'->>'rejectsPastAndFuture' IS DISTINCT FROM 'true' OR b->'checks'->>'executionFenced' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'EVIDENCE_INVALID'; END IF;
   INSERT INTO public.submission_evidence(organization_id,order_id,submission_id,evidence_id,operation_id,execution_id,source,conclusion,business_hash,request_hash,target_account,connection_generation,external_order_id,checks,content_rejected,details_encrypted,details_hash,author_id)
    VALUES(org,oid,sid,eid,c.operation_id,c.execution_id,'LAB_ATTESTATION',b->>'conclusion',s.business_hash,s.request_hash,s.target_account,s.connection_generation,b->>'externalId',b->'checks',coalesce((b->>'contentRejected')::boolean,false),convert_to(b->>'detailsEnvelope','UTF8'),b->>'detailsHash',actor);
  END IF;
  SELECT * INTO e FROM public.submission_evidence WHERE organization_id=org AND order_id=oid AND submission_id=sid AND evidence_id=eid;
  IF NOT FOUND OR (p_action='RESOLVE' AND (length(coalesce(b->>'reasonHash',''))<>64 OR b->>'reasonEnvelope' IS NULL)) THEN RAISE EXCEPTION 'EVIDENCE_INVALID'; END IF;
  SELECT * INTO c FROM public.submission_communications WHERE organization_id=org AND operation_id=e.operation_id FOR UPDATE;
  -- A late observation is always stored. It never overwrites terminal truth on stale CAS.
  conflict:=s.conflict_hold OR o.conflict_hold OR (s.state='SUBMITTED' AND (e.conclusion<>'ACCEPTED' OR e.external_order_id IS DISTINCT FROM s.external_order_id))
   OR (s.certainty='REJECTED_FINAL' AND e.conclusion='ACCEPTED') OR (c.safe_closed_at IS NOT NULL AND c.outcome IN ('NO_EFFECT','REJECTED_FINAL') AND e.conclusion='ACCEPTED')
   OR (s.released_at IS NOT NULL AND e.conclusion='ACCEPTED')
   OR (e.conclusion='ACCEPTED' AND EXISTS(SELECT 1 FROM public.order_submissions WHERE organization_id=org AND provider=s.provider AND target_account=s.target_account AND external_order_id=e.external_order_id AND submission_id<>sid));
  IF conflict THEN
   UPDATE public.submission_orders SET conflict_hold=true,anchor_revision=anchor_revision+1 WHERE organization_id=org AND order_id=oid;
   UPDATE public.order_submissions SET conflict_hold=true,ledger_revision=ledger_revision+1,updated_at=now(),state=CASE WHEN state IN ('READY','SUBMITTED') OR released_at IS NOT NULL THEN state ELSE 'UNKNOWN' END,certainty=CASE WHEN state IN ('READY','SUBMITTED') OR released_at IS NOT NULL THEN certainty ELSE 'CONFLICT' END WHERE organization_id=org AND order_id=oid;
  ELSIF e.conclusion='ACCEPTED' THEN
   IF s.state NOT IN ('SUBMITTING','UNKNOWN','ERROR','SUBMITTED') THEN RAISE EXCEPTION 'STATE_FORBIDDEN'; END IF;
   UPDATE public.submission_communications SET outcome='ACCEPTED',potential_effect=false,safe_closed_at=now(),closed_evidence_id=eid,finished_at=now() WHERE organization_id=org AND operation_id=c.operation_id;
   UPDATE public.order_submissions SET state='SUBMITTED',certainty='ACCEPTED',external_order_id=e.external_order_id,accepted_evidence_id=coalesce(accepted_evidence_id,eid),last_evidence_id=eid,ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
   UPDATE public.submission_orders SET accepted_submission_id=sid,anchor_revision=anchor_revision+1 WHERE organization_id=org AND order_id=oid;
  ELSIF e.conclusion IN ('NO_EFFECT','REJECTED_FINAL') THEN
   IF s.state NOT IN ('SUBMITTING','UNKNOWN','ERROR') OR s.released_at IS NOT NULL THEN RAISE EXCEPTION 'STATE_FORBIDDEN'; END IF;
   -- An old closed execution cannot exonerate a more recent capable CREATE.
   IF EXISTS(SELECT 1 FROM public.submission_communications WHERE organization_id=org AND submission_id=sid AND kind='CREATE' AND potential_effect AND operation_id IS DISTINCT FROM c.operation_id) THEN
    UPDATE public.order_submissions SET state='UNKNOWN',certainty='INCONCLUSIVE',ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
   ELSE
    UPDATE public.submission_communications SET outcome=e.conclusion,potential_effect=false,safe_closed_at=now(),closed_evidence_id=eid,finished_at=now() WHERE organization_id=org AND operation_id=c.operation_id;
    UPDATE public.order_submissions SET state='ERROR',certainty=e.conclusion,last_evidence_id=eid,ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
   END IF;
  ELSE
   UPDATE public.submission_communications SET outcome='INCONCLUSIVE',finished_at=now() WHERE organization_id=org AND operation_id=c.operation_id;
   UPDATE public.order_submissions SET state=CASE WHEN state='SUBMITTED' THEN state ELSE 'UNKNOWN' END,certainty=CASE WHEN state='SUBMITTED' THEN certainty ELSE 'INCONCLUSIVE' END,ledger_revision=ledger_revision+1,updated_at=now() WHERE organization_id=org AND submission_id=sid;
  END IF;
 END IF;
 IF op IS NOT NULL THEN receipt:=receipt||jsonb_build_object('operationId',op,'executionId',ex); END IF;
 IF eid IS NOT NULL THEN receipt:=receipt||jsonb_build_object('evidenceId',eid,'result',CASE WHEN conflict THEN 'CONFLICT_HELD' ELSE 'EVIDENCE_RECORDED' END); END IF;
 UPDATE public.submission_orders SET event_sequence=event_sequence+1,updated_at=now() WHERE organization_id=org AND order_id=oid RETURNING * INTO o;
 event_action:=p_action;
 INSERT INTO public.submission_events(organization_id,order_id,submission_id,sequence,action,actor_id,session_id,command_id,command_digest,command_receipt,evidence_id,from_state,to_state,justification_encrypted,justification_hash)
 VALUES(org,oid,sid,o.event_sequence,event_action,actor,p_session,p_command,digest,receipt,eid,oldstate,(SELECT state FROM public.order_submissions WHERE organization_id=org AND submission_id=sid),convert_to(b->>'reasonEnvelope','UTF8'),b->>'reasonHash');
 RETURN jsonb_build_object('commandReceipt',receipt,'projection',public.submission_projection(org,oid,sid),'replay',false);
END $$;
REVOKE ALL ON FUNCTION submission_command(uuid,uuid,text,jsonb) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION submission_consistency() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid; oid uuid; o public.submission_orders;
BEGIN
 org:=NEW.organization_id;oid:=NEW.order_id;
 SELECT * INTO o FROM public.submission_orders WHERE organization_id=org AND order_id=oid;
 IF o.current_submission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_submissions WHERE organization_id=org AND order_id=oid AND submission_id=o.current_submission_id AND released_at IS NULL) THEN RAISE EXCEPTION 'POINTER_INVALID'; END IF;
 IF o.current_submission_id IS NULL AND EXISTS(SELECT 1 FROM public.order_submissions WHERE organization_id=org AND order_id=oid AND released_at IS NULL) THEN RAISE EXCEPTION 'POINTER_INVALID'; END IF;
 IF o.accepted_submission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_submissions s JOIN public.submission_evidence e ON (e.organization_id,e.order_id,e.submission_id,e.evidence_id)=(s.organization_id,s.order_id,s.submission_id,s.accepted_evidence_id)
  WHERE s.organization_id=org AND s.order_id=oid AND s.submission_id=o.accepted_submission_id AND s.state='SUBMITTED' AND e.conclusion='ACCEPTED' AND e.external_order_id=s.external_order_id AND e.business_hash=s.business_hash AND e.request_hash=s.request_hash AND e.target_account=s.target_account) THEN RAISE EXCEPTION 'POINTER_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM public.submission_communications c LEFT JOIN public.submission_evidence e ON (e.organization_id,e.order_id,e.submission_id,e.evidence_id)=(c.organization_id,c.order_id,c.submission_id,c.closed_evidence_id)
  WHERE c.organization_id=org AND c.order_id=oid AND c.safe_closed_at IS NOT NULL AND (e.evidence_id IS NULL OR e.operation_id<>c.operation_id OR e.execution_id<>c.execution_id OR e.conclusion<>c.outcome)) THEN RAISE EXCEPTION 'CLOSURE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_submissions s LEFT JOIN public.submission_evidence e ON (e.organization_id,e.order_id,e.submission_id,e.evidence_id)=(s.organization_id,s.order_id,s.submission_id,s.last_evidence_id)
  WHERE s.organization_id=org AND s.order_id=oid AND s.state='ERROR' AND (e.evidence_id IS NULL OR e.conclusion NOT IN ('NO_EFFECT','REJECTED_FINAL') OR e.conclusion<>s.certainty OR EXISTS(SELECT 1 FROM public.submission_communications c WHERE c.organization_id=org AND c.submission_id=s.submission_id AND c.kind='CREATE' AND c.potential_effect))) THEN RAISE EXCEPTION 'EVIDENCE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_submissions s WHERE s.organization_id=org AND s.order_id=oid AND s.state='SUBMITTED' AND o.accepted_submission_id IS DISTINCT FROM s.submission_id) THEN RAISE EXCEPTION 'POINTER_INVALID'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER submission_orders_consistent AFTER INSERT OR UPDATE ON submission_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION submission_consistency();
CREATE CONSTRAINT TRIGGER order_submissions_consistent AFTER INSERT OR UPDATE ON order_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION submission_consistency();
CREATE CONSTRAINT TRIGGER submission_communications_consistent AFTER INSERT OR UPDATE ON submission_communications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION submission_consistency();
REVOKE ALL ON FUNCTION submission_consistency() FROM PUBLIC;
--> statement-breakpoint
-- Maintenance-only: runtime role never receives EXECUTE. Caller must verify plaintext with old/new Vaults.
-- Expected ciphertext gives CAS against a concurrent rotation, without changing logical bytes/hashes.
CREATE FUNCTION submission_rotate(p_session uuid,p_order uuid,p_sub uuid,p_evidence uuid,p_old text,p_new text,p_old_request text DEFAULT NULL,p_new_request text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; org uuid; actor uuid; seq integer;
BEGIN
 a:=public.submission_auth(p_session);org:=(a->>'organizationId')::uuid;actor:=(a->>'userId')::uuid;
 IF a->>'role'<>'ADMIN' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM 1 FROM public.submission_orders WHERE organization_id=org AND order_id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_UNAVAILABLE'; END IF;
 PERFORM set_config('atram.rotation','verified-maintenance',true);
 IF p_evidence IS NULL THEN
  UPDATE public.order_submissions SET snapshot_encrypted=convert_to(p_new,'UTF8'),request_encrypted=convert_to(p_new_request,'UTF8')
   WHERE organization_id=org AND order_id=p_order AND submission_id=p_sub AND snapshot_encrypted=convert_to(p_old,'UTF8') AND request_encrypted=convert_to(p_old_request,'UTF8');
 ELSE
  UPDATE public.submission_evidence SET details_encrypted=convert_to(p_new,'UTF8') WHERE organization_id=org AND order_id=p_order AND submission_id=p_sub AND evidence_id=p_evidence AND details_encrypted=convert_to(p_old,'UTF8');
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 PERFORM set_config('atram.rotation','',true);
 UPDATE public.submission_orders SET event_sequence=event_sequence+1 WHERE organization_id=org AND order_id=p_order RETURNING event_sequence INTO seq;
 INSERT INTO public.submission_events(organization_id,order_id,submission_id,sequence,action,actor_id,session_id,evidence_id)
  VALUES(org,p_order,p_sub,seq,'KEY_ROTATED',actor,p_session,p_evidence);
END $$;
REVOKE ALL ON FUNCTION submission_rotate(uuid,uuid,uuid,uuid,text,text,text,text) FROM PUBLIC;
--> statement-breakpoint
-- Separate post-rollback denial audit. No request body, foreign resource or secret is logged.
CREATE FUNCTION submission_denial(p_session uuid,p_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_code NOT IN ('UNAUTHENTICATED','FORBIDDEN','RESOURCE_UNAVAILABLE','INPUT_INVALID','EVIDENCE_INVALID','COMMAND_CONFLICT','IDENTITY_CONFLICT','REVISION_CONFLICT','ORDER_OCCUPIED','CONTENT_UNCHANGED','OUTCOME_BLOCKED','STATE_FORBIDDEN') THEN RETURN; END IF;
 INSERT INTO public.audit_events(organization_id,user_id,action,result,correlation_id)
 SELECT organization_id,user_id,'SUBMISSION_DENIED',p_code,gen_random_uuid() FROM public.sessions WHERE id=p_session;
END $$;
REVOKE ALL ON FUNCTION submission_denial(uuid,text) FROM PUBLIC;
