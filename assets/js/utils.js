function $(id){

    const element = document.getElementById(id);

    if(!element){
        console.warn("HTML elementi bulunamadı:", id);
    }

    return element;

}
function safeText(value){
    if(value === null || value === undefined) return "";
    return String(value).trim();
}

function escapeHTML(value){
    return safeText(value)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function normalizeList(value){

    if(!Array.isArray(value)) return [];

    return value
        .map(item=>{

            if(typeof item==="string"){
                return {title:item,url:""};
            }

            return{
                title:
                    item?.title ||
                    item?.name ||
                    item?.topic ||
                    item?.question ||
                    item?.text ||
                    "",
                url:
                    item?.url ||
                    item?.link ||
                    ""
            };

        })
        .filter(item=>item.title);

}