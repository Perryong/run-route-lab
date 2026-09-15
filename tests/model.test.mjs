import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../site/model.js';
test('pace has no bogus zero when distance or duration missing',()=>{
  assert.equal(model.pace(5000,1500),'5:00');assert.equal(model.pace(0,100),'—');assert.equal(model.pace(5000,null),'—');
});
test('filters inclusive dates and case insensitive names',()=>{
 const a=[{name:'Marina Bay',date:'2026-09-01'},{name:'Park',date:'2026-09-03'}];
 assert.equal(model.filterRuns(a,{query:'MARINA',from:'2026-09-01',to:'2026-09-01'}).length,1);
 assert.equal(model.filterRuns(a,{from:'2026-09-02'}).length,1);
});
test('weekly totals include year boundary and missing weeks',()=>{
 const result=model.weeks([{date:'2025-12-31',distance_m:5000},{date:'2026-01-05',distance_m:2000}],3,'2026-01-11');
 assert.deepEqual(result.map(w=>w.km),[0,5,2]);
});
test('duration carries rounded seconds to next minute',()=>assert.equal(model.duration(3599.9),'1h 00m'));
