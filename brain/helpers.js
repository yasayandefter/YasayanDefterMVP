/*
=========================================================
 YAŞAYAN DEFTER
 Brain Engine 11.0
 Helpers
=========================================================
*/

function cleanText(value){

    return String(value || "")
        .replace(/\s+/g," ")
        .trim();

}

function normalize(value){

    return cleanText(value)
        .toLocaleLowerCase("tr-TR")
        .replace(/â/g,"a")
        .replace(/î/g,"i")
        .replace(/û/g,"u");

}

function shorten(text,max=700){

    text=cleanText(text);

    if(text.length<=max)
        return text;

    return text.substring(0,max)+"...";

}

function uniqueStrings(list){

    return [...new Set(

        list
        .map(cleanText)
        .filter(Boolean)

    )];

}

function tokenize(text){

    return normalize(text)

        .replace(/[?!.:,;()[\]{}"'“”‘’/\\-]+/g," ")

        .split(/\s+/)

        .filter(Boolean);

}

function containsAny(text,words){

    const value=normalize(text);

    return words.some(word=>

        value.includes(normalize(word))

    );

}

function countMatches(text,words){

    const value=normalize(text);

    let total=0;

    for(const word of words){

        if(value.includes(normalize(word)))
            total++;

    }

    return total;

}

function sentences(text){

    return cleanText(text)

        .split(/(?<=[.!?])\s+/)

        .filter(x=>x.length>20);

}

const Helpers={

    cleanText,
    normalize,
    shorten,
    uniqueStrings,
    tokenize,
    containsAny,
    countMatches,
    sentences

};

if(typeof module!=="undefined"){

    module.exports=Helpers;

}

if(typeof window!=="undefined"){

    window.Helpers=Helpers;

}