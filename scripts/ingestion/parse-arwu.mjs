// Parse the publisher's data-only JSONP as an AST. Never execute downloaded JS.
import {readFileSync,writeFileSync} from 'node:fs';
import {parse} from 'acorn';
const tree=parse(readFileSync('data/raw/arwu/payload-2026.js','utf8'),{ecmaVersion:'latest'});
function literal(n,env={}) {
 if(n.type==='Literal')return n.value;
 if(n.type==='Identifier') {if(Object.hasOwn(env,n.name))return env[n.name];throw Error('Unknown identifier '+n.name);}
 if(n.type==='ArrayExpression')return n.elements.map(x=>literal(x,env));
 if(n.type==='ObjectExpression')return Object.fromEntries(n.properties.map(p=>{if(p.type!=='Property'||p.kind!=='init'||p.computed)throw Error('Non-data property');return [p.key.name??p.key.value,literal(p.value,env)];}));
 if(n.type==='UnaryExpression'&&n.operator==='void'){literal(n.argument,env);return null;}
 if(n.type==='UnaryExpression'&&n.operator==='!')return !literal(n.argument,env);
 if(n.type==='UnaryExpression'&&n.operator==='-')return -literal(n.argument,env);
 if(n.type==='CallExpression'&&n.callee.type==='FunctionExpression') {
  const f=n.callee,scope={...env};
  f.params.forEach((p,i)=>{if(p.type!=='Identifier')throw Error('Invalid parameter');scope[p.name]=literal(n.arguments[i],env);});
  for(const statement of f.body.body) {
   if(statement.type==='ReturnStatement')return literal(statement.argument,scope);
   const e=statement.expression;
   if(statement.type!=='ExpressionStatement'||e.type!=='AssignmentExpression'||e.operator!=='='||e.left.type!=='MemberExpression'||e.left.object.type!=='Identifier')throw Error('Non-data statement');
   const target=scope[e.left.object.name],key=e.left.computed?literal(e.left.property,scope):e.left.property.name;
   if(!target||typeof target!=='object'||['__proto__','constructor','prototype'].includes(String(key)))throw Error('Unsafe data property');
   target[key]=literal(e.right,scope);
  }
 }

 throw Error('Unsupported data syntax '+n.type);
}
const call=tree.body[0].expression;
if(call.type!=='CallExpression'||call.callee.name!=='__NUXT_JSONP__')throw Error('Unexpected publisher payload');
const data=literal(call.arguments[1]);
writeFileSync('data/raw/arwu/2026.json',JSON.stringify(data,null,2));
console.log(Object.keys(data));
