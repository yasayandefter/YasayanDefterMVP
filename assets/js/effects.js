(function(){

const field = document.getElementById("starfield");

if(!field) return;

for(let i=0;i<180;i++){

    const star=document.createElement("div");

    star.className="star";

    if(Math.random()>.85){

        star.classList.add("big");

    }

    star.style.left=Math.random()*100+"%";
    star.style.top=Math.random()*100+"%";

    const size=Math.random()*2+1;

    star.style.width=size+"px";
    star.style.height=size+"px";

    star.style.animationDuration=
        (Math.random()*6+2)+"s";

    star.style.animationDelay=
        (Math.random()*4)+"s";

    field.appendChild(star);

}

})();
// ===========================
// BILGI EVRENI
// ===========================

const canvas = document.getElementById("universe");

if(canvas){

const ctx = canvas.getContext("2d");

function resize(){

    canvas.width=canvas.offsetWidth;
    canvas.height=canvas.offsetHeight;

}

resize();

window.addEventListener("resize",resize);

const particles=[];

for(let i=0;i<55;i++){

    particles.push({

        x:Math.random()*canvas.width,

        y:Math.random()*canvas.height,

        vx:(Math.random()-.5)*0.4,

        vy:(Math.random()-.5)*0.4

    });

}

function draw(){

    ctx.clearRect(0,0,canvas.width,canvas.height);

    for(const p of particles){

        p.x+=p.vx;

        p.y+=p.vy;

        if(p.x<0||p.x>canvas.width)p.vx*=-1;

        if(p.y<0||p.y>canvas.height)p.vy*=-1;

        ctx.beginPath();

        ctx.arc(p.x,p.y,2,0,Math.PI*2);

        ctx.fillStyle="#7ffcff";

        ctx.fill();

    }

    for(let i=0;i<particles.length;i++){

        for(let j=i+1;j<particles.length;j++){

            const a=particles[i];

            const b=particles[j];

            const dx=a.x-b.x;

            const dy=a.y-b.y;

            const d=Math.sqrt(dx*dx+dy*dy);

            if(d<140){

                ctx.strokeStyle=`rgba(127,252,255,${1-d/140})`;

                ctx.beginPath();

                ctx.moveTo(a.x,a.y);

                ctx.lineTo(b.x,b.y);

                ctx.stroke();

            }

        }

    }

    requestAnimationFrame(draw);

}

draw();

}
/* ==========================================
   HERO 3D PARALLAX
========================================== */

const hero = document.querySelector(".hero");

if(hero){

document.addEventListener("mousemove",(e)=>{

    const x = (e.clientX/window.innerWidth-.5)*20;

    const y = (e.clientY/window.innerHeight-.5)*20;

    hero.style.transform=
    `
        perspective(1200px)
        rotateX(${-y}deg)
        rotateY(${x}deg)
    `;

});

document.addEventListener("mouseleave",()=>{

    hero.style.transform=
    `
        perspective(1200px)
        rotateX(0deg)
        rotateY(0deg)
    `;

});

}
/* ==========================================
   LIVE DASHBOARD COUNTERS
========================================== */

animateCounter("sourceCounter",120);

animateCounter("imageCounter",1);

animateCounter("speedCounter",0.8);

function animateCounter(id,target){

const el=document.getElementById(id);

if(!el) return;

let value=0;

const interval=setInterval(()=>{

value+=target/40;

if(value>=target){

value=target;

clearInterval(interval);

}

el.innerText=
target<2
?value.toFixed(1)
:Math.floor(value);

},25);

}
/* ==========================================
   LIVE CLOCK
========================================== */

const clock=document.getElementById("liveClock");
const date=document.getElementById("liveDate");

function updateClock(){

if(!clock||!date) return;

const now=new Date();

clock.innerText=now.toLocaleTimeString("tr-TR");

date.innerText=now.toLocaleDateString("tr-TR",{

day:"numeric",
month:"long",
year:"numeric"

});

}

updateClock();

setInterval(updateClock,1000);