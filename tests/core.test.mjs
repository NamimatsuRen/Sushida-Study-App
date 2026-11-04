import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMarkdown,matches,schedule,pickCards,attachIds} from '../dist/core.js';
test('Markdown supports Japanese prompts, aliases and explanations',()=>{
const p=parseMarkdown('# 化学\n## 水は？\n答え: H2O | H₂O\n解説: 水素と酸素');
assert.deepEqual(p,{title:'化学',cards:[{question:'水は？',answers:['H2O','H₂O'],explanation:'水素と酸素'}],errors:[]});
});
test('Incomplete cards and empty aliases block import',()=>{assert.ok(parseMarkdown('# only a title').errors.length);assert.ok(parseMarkdown('## q\n答え: a |').errors.length);assert.ok(parseMarkdown('## q\n解説: no answer').errors.length);});
test('Answer matching normalizes width/case/whitespace without loose fuzzy grading',()=>{assert.ok(matches(' ＨＴＭＬ ',['html']));assert.ok(matches('水',['water','水']));assert.equal(matches('HTM',['HTML']),false);assert.equal(matches('', ['HTML']),false);});
test('Spaced schedule distinguishes failed recall and correct recall',()=>{const now=1000,first=schedule(null,true,now),second=schedule(first,true,now);assert.equal(first.due,now+86400000);assert.equal(second.interval,2);const missed=schedule(second,false,now);assert.equal(missed.due,now+600000);assert.equal(missed.interval,0);assert.equal(missed.attempts,3);assert.equal(missed.correct,2);assert.equal(schedule({interval:64},true,now).interval,90);});
test('Selection prioritizes unseen and overdue items without mutating deck',()=>{const cards=attachIds([{question:'a'},{question:'b'},{question:'c'}],'d');const picked=pickCards(cards,{'d:0':{due:100},'d:1':{due:50}},2,0);assert.deepEqual(picked.map(c=>c.id),['d:2','d:1']);assert.equal(cards[0].id,'d:0');});
