export const SAMPLE_ACTIVITY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Explore the water cycle</title>
<style>
:root{font-family:Arial,sans-serif;color:#26352b;background:#f6f8f5}*{box-sizing:border-box}body{margin:0;padding:24px 16px}.wrap{max-width:760px;margin:auto}.top{font-size:11px;letter-spacing:1.4px;color:#547663;font-weight:700}.panel{background:white;border:1px solid #e2e9e2;border-radius:14px;padding:22px;margin:18px 0;box-shadow:0 8px 24px #253c2a0b}h1{font-size:clamp(25px,5vw,38px);margin:8px 0}p{line-height:1.6;color:#647269}.cycle{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.stage{border:1px solid #e0e9e1;border-radius:10px;padding:14px;text-align:center;background:#f7faf6}.stage b{display:block;margin:7px 0 4px}.stage span{font-size:25px}.stage small{color:#728077}.control{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.control input{accent-color:#35634d;flex:1;min-width:150px}.button{border:0;border-radius:7px;background:#35634d;color:white;padding:12px 17px;font-weight:700;cursor:pointer}.answer{padding:13px;border-radius:8px;background:#edf4ee;margin-top:12px;display:none}.result{font-weight:700;color:#35634d}@media(max-width:560px){.cycle{grid-template-columns:1fr}.stage{display:flex;align-items:center;text-align:left;gap:12px}.stage b{margin:0}}
</style>
</head>
<body><main class="wrap">
<div class="top">MORROW SAMPLE ACTIVITY</div><h1>Explore the water cycle</h1>
<p>Move the sun's energy slider and explore how heat changes the movement of water around Earth.</p>
<section class="panel"><div class="cycle"><div class="stage"><span>☀️</span><b>Evaporation</b><small>Sunlight warms water and turns it into vapour.</small></div><div class="stage"><span>☁️</span><b>Condensation</b><small>Water vapour cools and forms tiny droplets.</small></div><div class="stage"><span>🌧️</span><b>Precipitation</b><small>Water falls back to the ground as rain.</small></div></div>
<h2>Try the simulation</h2><p>How strongly is the sun heating the water?</p><div class="control"><input id="heat" type="range" min="0" max="100" value="45"><strong id="heatValue">45%</strong></div><p id="heatText">Some water is evaporating.</p></section>
<section class="panel"><h2>Check your understanding</h2><p>Which stage forms clouds when water vapour cools?</p><div class="control"><button class="button" data-answer="evaporation">Evaporation</button><button class="button" data-answer="condensation">Condensation</button><button class="button" data-answer="precipitation">Precipitation</button></div><div class="answer" id="answer"></div></section>
<p class="result" id="score">Try the activity and check your understanding.</p>
</main><script>
const slider=document.getElementById('heat'),value=document.getElementById('heatValue'),text=document.getElementById('heatText');slider.addEventListener('input',()=>{value.textContent=slider.value+'%';text.textContent=slider.value>70?'Strong heating: evaporation happens faster.':slider.value>30?'Some water is evaporating.':'Low heating: evaporation is slower.'});let points=0;document.querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',()=>{const correct=button.dataset.answer==='condensation';document.getElementById('answer').style.display='block';document.getElementById('answer').textContent=correct?'That is right. Cooling causes condensation.':'Not quite. Think about what happens when vapour cools.';if(correct)points=1;document.getElementById('score').textContent=correct?'Well done! You got it.':'Keep exploring and try again.';if(window.reportScore)window.reportScore(points,1)}));
</script></body></html>`;
