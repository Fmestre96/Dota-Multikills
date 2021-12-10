function listFiles(event) {
    const input = document.getElementById("input-file")
    if ('files' in input && input.files.length > 0) {
        clearFiles()
        for (let i = 0, numFiles = input.files.length; i < numFiles; i++) {
            const file = input.files[i];
            addToFileList(file)
        }
    }
}

function clearFiles(){
    document.getElementById('filesArea').innerHTML = ''
}


function addToFileList(file){
    let fel = document.getElementById("filesArea")
    fel.innerHTML += 
    `<div style="cursor: pointer;" id="${file.name}" onclick="analyseFile('${file.name}')">
        <span style="color:white">&#9673;</span>
        <span style="color:white">${file.name}</span>
    </div>`
}

function analyseFile(name){
    let file = findFile(name)
    scanFile(file)
}

function findFile(name){
    const input = document.getElementById("input-file")
    if ('files' in input && input.files.length > 0) {
        for (let i = 0, numFiles = input.files.length; i < numFiles; i++) {
            if(input.files[i].name == name){
                return input.files[i]
            }
        }
    }
}

function displayFileDetails(logDetails){


    console.log(logDetails)
    let target = document.getElementById("content-target")
    let bufferText = `File:  ${logDetails.file}\n\n`

    for(map in logDetails.multikills){
        bufferText += `Map ${map}\n`
        for (mk in logDetails.multikills[map]){
            bufferText += `\t ${mk}:   ${logDetails.multikills[map][mk]}\n`
        }
        bufferText += `\n`
    }
    target.value = bufferText
}

function readFileContent(file) {
	const reader = new FileReader()
    return new Promise((resolve, reject) => {
    reader.onload = event => resolve(event.target.result)
    reader.onerror = error => reject(error)
    reader.readAsText(file)
  })
}

async function scanFile(file){
    logDetails = {
        'file': file.name,
        'numEvents': {},
        'players':{},
        'multikills':{},
        'gameStartTimestamp':0,
        'mapNumber':0,
    }
    console.log(file)
    let text = await readFileContent(file)
    lines = text.split(/\r?\n/)
    lines.forEach(line => {
        try{
            let startIndex = line.indexOf('{');
            if (startIndex > 0) {
                startIndex = startIndex - 1
            }
            const lineAsJson = JSON.parse(line.substring(startIndex));
            if (lineAsJson["type"] === 'gsk' || lineAsJson["type"] === 'hltvDraft') return;
    
            let content = lineAsJson.content["combatLogsUpdate"];
            if(content && content.length!=0) {
                
                let correctedString = content[0].replace(RegExp('\r\n', 'g') , '",').replace(RegExp('\t', 'g'), '"').replace(RegExp(': ', 'g'),'\" : \"').replace('\",','').replace(',}','}')
                processEvent(correctedString, logDetails)
                content.forEach(element => {
                    let correctedString = element.replace(RegExp('\r\n', 'g') , '",').replace(RegExp('\t', 'g'), '"').replace(RegExp(': ', 'g'),'\" : \"').replace('\",','').replace(',}','}')
                    processEvent(correctedString, logDetails)
                });
            }
        }
        catch(e){
            console.log("Skipped")
        }
    });
    displayFileDetails(logDetails)
}


function processEvent(event, logDetails){
    let parsedEvent = JSON.parse(event)
    let currentTime = parseFloat(parsedEvent.timestamp)

    // GameStart
    if (parsedEvent.type=="9" && parsedEvent.value == "5"){
        logDetails.gameStartTimestamp = currentTime
        logDetails.mapNumber ++
        logDetails.multikills[logDetails.mapNumber] = {}
        logDetails.players = {}
    }

    if(parsedEvent.type=="4" && parsedEvent.target.includes("hero")){
        if (!Object.keys(logDetails.players).includes(parsedEvent.attacker_name)){
            logDetails.players[parsedEvent.attacker_name] = {'lastKill': 0, 'multikill':0}
        }
        // Multikill happens here
        if(currentTime - logDetails.players[parsedEvent.attacker_name].lastKill < 18){
            let minute = getMinute(currentTime - logDetails.gameStartTimestamp)
            logDetails.players[parsedEvent.attacker_name].multikill ++
            
            logDetails.multikills[logDetails.mapNumber][minute] = parsedEvent.attacker_name.replace("npc_dota_hero_","") + " got a " + logDetails.players[parsedEvent.attacker_name].multikill + "x multikill"
            //console.log(minute + ": " + parsedEvent.attacker_name.replace("npc_dota_hero_","") + " is on a multikill " + logDetails.players[parsedEvent.attacker_name].multikill)
        }
        else{
            logDetails.players[parsedEvent.attacker_name].multikill = 1
        }
        logDetails.players[parsedEvent.attacker_name].lastKill = parseFloat(parsedEvent.timestamp)
    }
    if(!logDetails.numEvents[parsedEvent.type]){
        logDetails.numEvents[parsedEvent.type] = {}
    }
    if(!logDetails.numEvents[parsedEvent.type][parsedEvent.value]){
        logDetails.numEvents[parsedEvent.type][parsedEvent.value] = 0
    }
    logDetails.numEvents[parsedEvent.type][parsedEvent.value] ++ 
}

function getMinute(timestamp){
    exactTime = parseFloat(timestamp) / 60
    minute = Math.floor(exactTime)
    seconds = Math.floor((exactTime % 1) * 60)
    return `${minute}:${seconds}`
}




// Combat Log Data Types
// 0: "DOTA_COMBATLOG_DAMAGE"
// 1: "DOTA_COMBATLOG_HEAL"
// 2: "DOTA_COMBATLOG_MODIFIER_ADD"
// 3: "DOTA_COMBATLOG_MODIFIER_REMOVE"
// 4: "DOTA_COMBATLOG_DEATH"
// 5: "DOTA_COMBATLOG_ABILITY"
// 6: "DOTA_COMBATLOG_ITEM"
// 7: "DOTA_COMBATLOG_LOCATION"
// 8: "DOTA_COMBATLOG_GOLD"
// 9: "DOTA_COMBATLOG_GAME_STATE"
// 10: "DOTA_COMBATLOG_XP"
// 11: "DOTA_COMBATLOG_PURCHASE"
// 12: "DOTA_COMBATLOG_BUYBACK"