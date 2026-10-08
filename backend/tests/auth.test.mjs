import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authFixture } from './fixtures.mjs';
import { AuthService } from '../auth/service.ts';
import { createBackendServer } from '../server/http.ts';
import { database } from '../db/client.ts';
test('7B.2B persistent sessions, authorization and two-organization isolation',async()=>{
  const f=await authFixture();const {auth,db,sa,sb}=f;
  try{
    assert.equal((await auth.authenticate(sa.token)).organizationId,f.a.organizationId);
    const afterRestart=database(f.url);try{assert.equal((await new AuthService(afterRestart,3600).authenticate(sa.token)).userId,f.a.userId);}finally{await afterRestart.close();}
    for(const [name,pwd,org] of [['admin-a','wrong',undefined],['absent',f.password,undefined],['admin-a',f.password,f.b.id]])await assert.rejects(auth.login(name,pwd,org,randomUUID()),/INVALID_CREDENTIALS/);
    await assert.rejects(auth.authenticate('stolen-invalid-token'),/UNAUTHENTICATED/);
    await assert.rejects(auth.checkCSRF(sa.principal,'wrong'),/CSRF_DENIED/);await auth.checkCSRF(sa.principal,sa.csrf);
    await assert.rejects(auth.manageUser(sa.principal,f.userB.id,'deactivate'),/USER_UNAVAILABLE/);
    const op=await auth.createUser(sa.principal,'operator-a',f.password,'OPERADOR');
    const so=await auth.login('operator-a',f.password,undefined,'operator');
    await assert.rejects(auth.listUsers(so.principal),/FORBIDDEN/);assert.equal((await auth.listUsers(sb.principal)).some(x=>x.id===op.id),false);
    await auth.manageUser(sa.principal,op.id,'reset','Different-secure-password!');await assert.rejects(auth.authenticate(so.token),/UNAUTHENTICATED/);
    const so2=await auth.login('operator-a','Different-secure-password!',undefined,'operator2');await auth.manageUser(sa.principal,op.id,'deactivate');await assert.rejects(auth.authenticate(so2.token),/UNAUTHENTICATED/);
    await assert.rejects(auth.login('operator-a','Different-secure-password!',undefined,'operator3'),/INVALID_CREDENTIALS/);
    const se=await auth.login('admin-b',f.password,undefined,'expire');await db.client`UPDATE sessions SET expires_at=NOW()-interval '1 second' WHERE id=${se.principal.sessionId}`;await assert.rejects(auth.authenticate(se.token),/UNAUTHENTICATED/);
    assert.ok(!(await db.client`SELECT session_token_hash FROM sessions`).some(x=>x.session_token_hash===sa.token));
    await auth.logout(sa.principal);await assert.rejects(auth.authenticate(sa.token),/UNAUTHENTICATED/);
    for(let i=0;i<8;i++)await assert.rejects(auth.login('nonexistent','wrong',undefined,'rate'));
    await assert.rejects(auth.login('nonexistent','wrong',undefined,'rate'),/LOGIN_RATE_LIMIT/);
    const [n]=await db.client`SELECT count(*)::int n FROM audit_events WHERE organization_id=${f.b.id}`;assert.ok(n.n>0);
  }finally{await f.cleanup();}
});
test('7B.2B HTTP authentication, CSRF, Host, Origin, RBAC and sanitized errors',async()=>{
  const f=await authFixture(), logs=[];
  const config={origin:'http://127.0.0.1:8790',secure:false,sessionSeconds:3600};
  const server=createBackendServer(config,f.auth,undefined,e=>logs.push(e));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;config.origin=origin;
  const call=(path,method='GET',body,cookie,csrf,extra={})=>fetch(origin+path,{method,redirect:'manual',headers:{...(method==='POST'?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
  try{
    assert.equal((await call('/api/health')).status,200);assert.equal((await call('/api/auth/me')).status,401);
    assert.equal((await call('/api/auth/login','POST',{login:'admin-a',password:f.password},undefined,undefined,{Origin:'https://evil.example'})).status,403);
    const login=await call('/api/auth/login','POST',{login:'admin-a',password:f.password});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0],data=await login.json();assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.ok(!JSON.stringify(data).includes(f.sa.token));
    assert.equal((await call('/api/auth/me','GET',undefined,cookie)).status,200);
    assert.equal((await call('/api/admin/users','POST',{login:'new-user',password:f.password,role:'OPERADOR'},cookie)).status,403);
    assert.equal((await call('/api/admin/users','POST',{login:'new-user',password:f.password,role:'OPERADOR',organizationId:f.b.id},cookie,data.csrfToken)).status,400);
    assert.equal((await call('/api/admin/users/'+f.userB.id+'/deactivate','POST',{},cookie,data.csrfToken)).status,404);
    assert.equal((await call('/api/auth/me?organizationId='+f.b.id,'GET',undefined,cookie)).status,400);
    assert.equal((await call('/api/auth/me','GET',undefined,cookie,undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await call('/api/health','GET',undefined,undefined,undefined,{Host:'evil.example'})).status,403);
    assert.equal((await call('/api/auth/logout','POST',{},cookie,data.csrfToken)).status,200);assert.equal((await call('/api/auth/me','GET',undefined,cookie)).status,401);
    assert.ok(!JSON.stringify(logs).includes(f.password));assert.ok(!JSON.stringify(logs).includes(cookie));
  }finally{await new Promise(r=>server.close(r));await f.cleanup();}
});
