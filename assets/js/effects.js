"use strict";

/* ==========================================================
   YAŞAYAN DEFTER
   EFFECTS.JS 14 PROFESSIONAL
   PART 1
========================================================== */

const Effects = {

    initialized: false,

    canvas: null,

    ctx: null,

    particles: [],

    mouse: {
        x: 0,
        y: 0
    },

    hero: null

};


/* ==========================================================
   DOM
========================================================== */

function $(id){

    return document.getElementById(id);

}


/* ==========================================================
   START
========================================================== */

function initializeEffects(){

    if(Effects.initialized){

        return;

    }

    Effects.initialized = true;

    console.log("✨ Effects Engine Başlatıldı");

    initializeClock();

    initializeCounters();

    initializeMouse();

    initializeStars();

    initializeParticles();

    initializeParallax();

}


/* ==========================================================
   CLOCK
========================================================== */

function initializeClock(){

    updateClock();

    setInterval(updateClock,1000);

}


/* ==========================================================
   COUNTERS
========================================================== */

function initializeCounters(){

    animateCounter("sourceCounter",120);

    animateCounter("imageCounter",1.0);

    animateCounter("speedCounter",0.8);

}


/* ==========================================================
   MOUSE
========================================================== */

function initializeMouse(){

    document.addEventListener("mousemove",(e)=>{

        Effects.mouse.x=e.clientX;

        Effects.mouse.y=e.clientY;

    });

}

/* ==========================================================
   CLOCK
========================================================== */

function updateClock(){

    const clock = $("liveClock");
    const date = $("liveDate");

    if(!clock || !date){
        return;
    }

    const now = new Date();

    clock.textContent = now.toLocaleTimeString("tr-TR");

    date.textContent = now.toLocaleDateString("tr-TR",{

        day:"numeric",
        month:"long",
        year:"numeric"

    });

}


/* ==========================================================
   COUNTERS
========================================================== */

function animateCounter(id,target){

    const element = $(id);

    if(!element){
        return;
    }

    let value = 0;

    const isDecimal = target % 1 !== 0;

    const step = target / 60;

    const timer = setInterval(()=>{

        value += step;

        if(value >= target){

            value = target;

            clearInterval(timer);

        }

        if(isDecimal){

            element.textContent = value.toFixed(1);

        }else{

            element.textContent = Math.floor(value);

        }

    },20);

}


/* ==========================================================
   STARFIELD
========================================================== */

function initializeStars(){

    const starfield = $("starfield");

    if(!starfield){
        return;
    }

    starfield.innerHTML = "";

    for(let i=0;i<120;i++){

        const star = document.createElement("span");

        star.className = "star";

        star.style.left = Math.random()*100 + "%";

        star.style.top = Math.random()*100 + "%";

        star.style.animationDelay =
            (Math.random()*6) + "s";

        star.style.animationDuration =
            (4 + Math.random()*6) + "s";

        starfield.appendChild(star);

    }

}

/* ==========================================================
   PARTICLES
========================================================== */

function initializeParticles(){

    const hero = document.querySelector(".hero-bg");

    if(!hero){
        return;
    }

    const container = document.createElement("div");

    container.className = "particles";

    hero.appendChild(container);

    for(let i=0;i<35;i++){

        const particle = document.createElement("span");

        particle.className = "particle";

        particle.style.left = Math.random()*100 + "%";

        particle.style.top = Math.random()*100 + "%";

        particle.style.animationDelay =
            (Math.random()*8) + "s";

        particle.style.animationDuration =
            (8 + Math.random()*8) + "s";

        particle.style.opacity =
            (0.2 + Math.random()*0.6);

        container.appendChild(particle);

    }

}


/* ==========================================================
   PARALLAX
========================================================== */

function initializeParallax(){

    const hero = document.querySelector(".hero");

    if(!hero){
        return;
    }

    document.addEventListener("mousemove",(e)=>{

        const x =
            (e.clientX/window.innerWidth-.5)*8;

        const y =
            (e.clientY/window.innerHeight-.5)*8;

        hero.style.transform =

        `perspective(1200px)
         rotateX(${-y}deg)
         rotateY(${x}deg)`;

    });

    document.addEventListener("mouseleave",()=>{

        hero.style.transform =

        `perspective(1200px)
         rotateX(0deg)
         rotateY(0deg)`;

    });

}