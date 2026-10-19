import test from 'node:test';
import assert from 'node:assert/strict';
import {studentMessage,interpretMessage} from '../conversation.mjs';
test('freshman profile messages are recognized without an AI query',()=>{
 for(const text of ["im a freshman","I'm a freshman","I am a freshman.",'freshman','first year']){
  assert.deepEqual(studentMessage(text),{standing:'freshman',topic:''});
 }
});
test('a topic following a year statement is preserved',()=>{
 assert.deepEqual(studentMessage('im a freshman and I want to learn structural design'),{standing:'freshman',topic:'I want to learn structural design'});
 assert.deepEqual(studentMessage('I’m a sophomore, interested in circuits'),{standing:'sophomore',topic:'interested in circuits'});
});
test('course interests are not rewritten as class standing',()=>{
 assert.deepEqual(studentMessage('Structural design'),{standing:null,topic:'Structural design'});
 assert.deepEqual(studentMessage('design a senior living building'),{standing:null,topic:'design a senior living building'});
});
test('profile-only messages and vague requests need no model inference',()=>{
 assert.equal(interpretMessage('im a freshman').kind,'profile');
 assert.equal(interpretMessage('I want fun courses').kind,'clarify');
 assert.equal(interpretMessage('I want something easy').kind,'clarify');
 assert.equal(interpretMessage('I want a fun robotics class').kind,'search');
});
test('completed coursework is captured only from an explicit positive statement',()=>{
 assert.deepEqual(interpretMessage("I've completed COMP 163 and MATH 131").updates.completed,['COMP 163','MATH 131']);
 assert.equal(interpretMessage("I've completed COMP 163 and MATH 131").kind,'profile');
 assert.deepEqual(interpretMessage("I haven't taken COMP 163").updates.completed,[]);
 assert.deepEqual(interpretMessage('I want to take COMP 163').updates.completed,[]);
 const mixed=interpretMessage('im a freshman and I have completed COMP 163 and want to learn cybersecurity');
 assert.equal(mixed.updates.standing,'freshman');
 assert.deepEqual(mixed.updates.completed,['COMP 163']);
 assert.equal(mixed.kind,'search');assert.match(mixed.topic,/cybersecurity/);
});
