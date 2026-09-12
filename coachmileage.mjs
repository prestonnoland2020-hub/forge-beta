/* Does the coach hear a mileage request phrased like a person? */
const first=/(\d+(?:\.\d+)?)\s*(?:mi|miles?|km|kilometers?)\s*(?:a|per|\/)\s*week/;
const second=/(?:weekly mileage|mileage|weekly running|(?:run|running|volume)[^.0-9]{0,24}?(?=\d))[^0-9]*(\d+(?:\.\d+)?)/;
const cases=[
 ['set my weekly mileage to 30',30],
 ['mileage 25',25],
 ['bump me to 25 miles a week',25],
 ['run 30 miles a week',30],
 ['increase my weekly running to 28',28],
 ['can you raise my running volume to 26 a week',26],
 ['I want to run 22 mi per week',22],
 ['my knee hurts',null],
 ['add 3 sets of bench',null],
];
let fails=0;
for (const [text,want] of cases){
  const low=text.toLowerCase();const m=low.match(first)||low.match(second);
  const got=m?Number(m[1]):null;
  const ok=got===want;
  if(!ok)fails+=1;
  console.log(`  ${ok?'PASS':'FAIL'}  "${text}" -> ${got}${ok?'':` (wanted ${want})`}`);
}
console.log(fails?`\n${fails} failed`:'\nAll checks passed');
process.exit(fails?1:0);
