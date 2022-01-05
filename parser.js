const fieldsToWatch = ['assists']
const displayMultikills = false
const displayChangesGSIFields = false
const displayGSIFieldsAtEnd = true

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
    let bufferText = `File:  ${logDetails.file}\nSeries:  ${logDetails.seriesId} \n\n`

    for(map in logDetails.maps){
        if (map==0) continue
        bufferText += `Map ${map}\n`

        if(displayMultikills){
            for (mk in logDetails.maps[map].multikills){
                bufferText += `\t${logDetails.maps[map].multikills[mk]}\n`
            }
        }
        if(displayChangesGSIFields){
            for (mk in logDetails.maps[map].detectedFieldChanges){
                bufferText += `\t${logDetails.maps[map].detectedFieldChanges[mk]}\n`
            }
        }
        if(displayGSIFieldsAtEnd){
            for (mk in logDetails.maps[map].fieldsToWatch){
                bufferText += `\t${logDetails.maps[map].fieldsToWatch[mk]}\n`
            }
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
        'mapNumber':0,
        'seriesId':'',
        'maps':{
            0:{
                'numEvents': {},
                'gsiEvents':0,
                'lastGSIEvent':{},
                'players':{},
                'multikills':[],
                'gameStartTimestamp':0,
                'preGameStartTimestamp':-90,
            }
        },
        'seriesStatus':0, // 0 = Not started || 1 = Ongoing
    }
    console.log(file)
    let text = await readFileContent(file)
    lines = text.split(/\r?\n/)
    for(let i = 0; i < lines.length-1; i++){
        line = lines[i]
        let startIndex = line.indexOf('{');
        if (startIndex > 0) {
            startIndex = startIndex - 1
        }
        const lineAsJson = JSON.parse(line.substring(startIndex));
        if (lineAsJson["type"] === 'gsk' || lineAsJson["type"] === 'hltvDraft') return;


        if(logDetails.seriesId == ''){
            logDetails.seriesId = lineAsJson.seriesId
        }
        let content = lineAsJson.content["combatLogsUpdate"];
        if(content && content.length!=0) {
            content.forEach(element => {
                let correctedString = element.replace(RegExp('\r\n', 'g') , '",').replace(RegExp('\t', 'g'), '"').replace(RegExp(': ', 'g'),'\" : \"').replace('\",','').replace(',}','}')
                processEvent(correctedString, logDetails)
            });
        }
        //If there is a game ongoing, process events
        if(logDetails.seriesStatus){
            let gsi = lineAsJson.content["gsiUpdate"]
            let parsedGSI = JSON.parse(gsi)
            processGSIdiff(logDetails.maps[logDetails.mapNumber].lastGSIEvent, parsedGSI, logDetails)
            logDetails.maps[logDetails.mapNumber].gsiEvents ++
            logDetails.maps[logDetails.mapNumber].lastGSIEvent = parsedGSI
        }
    }
    displayFileDetails(logDetails)
}


function processGSIdiff(oldGSI, newGSI, logDetails) {
    if(Object.keys(oldGSI).length==0) return 
    for(f in fieldsToWatch){
        for (let i = 2; i <=3; i++){
            let team = `team${i}`
            let playerCount = (i - 2) * 5
            for(let j = playerCount; j < playerCount+5; j++){
                let player = `player${j}`
                if (newGSI.player[team][player][fieldsToWatch[f]] != oldGSI.player[team][player][fieldsToWatch[f]]){
                    let minute = getMinute(newGSI.map.clock_time)
                    logDetails.maps[logDetails.mapNumber].detectedFieldChanges.push(`${minute}:  ${fieldsToWatch[f]} detected by ${newGSI.player[team][player].name}`)
                    //console.log(newGSI.player[team][player])
                }

            }
        }
    }
}

function processEvent(event, logDetails){
    
    let parsedEvent = JSON.parse(event)

    // GameStart (Actually Pre-game start - Game start doesnt fire every time?)
    if (parsedEvent.type=="9" && parsedEvent.value=="4"){
        processGameStart(logDetails, parsedEvent)
    }
    else if (parsedEvent.type=="9" && parsedEvent.value=="6"){
        processGameEnd(logDetails, parsedEvent)
    }


    //If there is a game ongoing, process events
    if(logDetails.seriesStatus){
        //Multikills
        if (parsedEvent.type=="15"){
            processMultikills(logDetails, parsedEvent)
        }
        else if (parsedEvent.type=="8" && parsedEvent.gold_reason=="12"){
            processPlayerAssist(logDetails, parsedEvent)
        }
        // else if (parsedEvent.type=="29"){
        //     console.log(parsedEvent)
        // }

        //Player Death
        // else if(parsedEvent.type=="4" && parsedEvent.target.includes("hero")){
        //     processPlayerDeath(logDetails, parsedEvent)
        // }
    }


    addToEventCounter(logDetails, parsedEvent)
}

function getMinute(timestamp){
    let exactTime = parseFloat(timestamp) / 60
    let minute = Math.floor(exactTime).toString()
    let seconds = Math.floor((exactTime % 1) * 60).toString()

    if(minute.length==1)  minute = `0${minute}`
    if(seconds.length==1)  seconds = `0${seconds}`

    return `${minute}:${seconds}`
}

function processGameStart(logDetails, parsedEvent){
    let currentTime = parseFloat(parsedEvent.timestamp)

    if(logDetails.maps[logDetails.mapNumber].gameStartTimestamp != currentTime){
        logDetails.mapNumber ++
        logDetails.maps[logDetails.mapNumber] = {
            'numEvents': {},
            'players':{},
            'multikills':[],
            'preGameStartTimestamp':currentTime,
            'gameStartTimestamp':currentTime+90,
            'gsiEvents':0,
            'lastGSIEvent':{},
            'detectedFieldChanges':[],
            'fieldsToWatch':[],
        }   
    }
    logDetails.seriesStatus = 1
}

function processGameEnd(logDetails, parsedEvent){
    let currentMap = logDetails.mapNumber
    let lastGSIEvent = logDetails.maps[logDetails.mapNumber].lastGSIEvent
    console.log(lastGSIEvent)
    logDetails.seriesStatus = 0
    for(f in fieldsToWatch){
        for (let i = 2; i <=3; i++){
            let team = `team${i}`
            let playerCount = (i - 2) * 5
            for(let j = playerCount; j < playerCount+5; j++){
                let player = `player${j}`
                let hero = lastGSIEvent.hero[team][player].name
                if(logDetails.maps[currentMap].players[hero] && logDetails.maps[currentMap].players[hero][fieldsToWatch[f]]){
                    logDetails.maps[currentMap].fieldsToWatch.push(`${hero}: ${lastGSIEvent.player[team][player][fieldsToWatch[f]]} (GSI) vs ${logDetails.maps[currentMap].players[hero][fieldsToWatch[f]]} (logs) `)
                }
                
            }
        }
    }
}

function processPlayerAssist(logDetails, parsedEvent){
    let attacker = parsedEvent.target
    let currentMap = logDetails.mapNumber
    if (attacker == "npc_dota_hero_kunkka"){
        let currentTime = parseFloat(parsedEvent.timestamp)
        let minute = getMinute(currentTime - logDetails.maps[currentMap].gameStartTimestamp)
        console.log(minute)
    }
    if (!Object.keys(logDetails.maps[currentMap].players).includes(attacker)){
        logDetails.maps[currentMap].players[attacker] = {'assists':0}
    }
    logDetails.maps[currentMap].players[attacker].assists += 1
}


function processPlayerDeath(logDetails, parsedEvent){
    let currentTime = parseFloat(parsedEvent.timestamp)
    let attacker = parsedEvent.attacker_name
    let currentMap = logDetails.mapNumber

    if (!Object.keys(logDetails.maps[currentMap].players).includes(attacker)){
        logDetails.maps[currentMap].players[attacker] = {'kills':[], 'multikills':[], 'lastKill': 0, 'multikill':0}
    }

    let minute = getMinute(currentTime - logDetails.maps[currentMap].gameStartTimestamp)
    logDetails.maps[currentMap].players[attacker].kills.push(minute)

    // Register multikill here
    if(currentTime - logDetails.maps[currentMap].players[attacker].lastKill < 18){
        logDetails.maps[currentMap].players[attacker].multikill ++
        logDetails.maps[currentMap].players[attacker].multikills.push(minute)
        //logDetails.maps[currentMap].multikills[minute] = attacker.replace("npc_dota_hero_","") + " got a " + logDetails.maps[currentMap].players[attacker].multikill + "x multikill"
        //console.log(currentMap + ": " + attacker.replace("npc_dota_hero_","") + " is on a multikill " + logDetails.players[attacker].multikill)
    }
    else{
        logDetails.maps[currentMap].players[attacker].multikill = 1
    }
    logDetails.maps[currentMap].players[attacker].lastKill = currentTime
}

function processMultikills(logDetails, parsedEvent){

    let currentTime = parseFloat(parsedEvent.timestamp)
    let attacker = parsedEvent.attacker_name
    let currentMap = logDetails.mapNumber

    let minute = getMinute(currentTime - logDetails.maps[currentMap].gameStartTimestamp)
    logDetails.maps[currentMap].multikills.push(`${minute}:  ${attacker.replace("npc_dota_hero_","")} got a ${parsedEvent.value}x multikill`)

}

function addToEventCounter(logDetails, parsedEvent){
    let type = parsedEvent.type
    let value = parsedEvent.value
    let currentMap = logDetails.mapNumber
    //Event Counters here
    if(!logDetails.maps[currentMap].numEvents[type]){
        logDetails.maps[currentMap].numEvents[type] = {}
    }
    if(!logDetails.maps[currentMap].numEvents[type][value]){
        logDetails.maps[currentMap].numEvents[type][value] = 0
    }
    logDetails.maps[currentMap].numEvents[type][value] ++ 
}
// Combat Log Data Types
// -1: "DOTA_COMBATLOG_INVALID"
// 0:  "DOTA_COMBATLOG_DAMAGE"
// 1:  "DOTA_COMBATLOG_HEAL"
// 2:  "DOTA_COMBATLOG_MODIFIER_ADD"
// 3:  "DOTA_COMBATLOG_MODIFIER_REMOVE"
// 4:  "DOTA_COMBATLOG_DEATH"
// 5:  "DOTA_COMBATLOG_ABILITY"
// 6:  "DOTA_COMBATLOG_ITEM"
// 7:  "DOTA_COMBATLOG_LOCATION"
// 8:  "DOTA_COMBATLOG_GOLD"
// 9:  "DOTA_COMBATLOG_GAME_STATE"
// 10: "DOTA_COMBATLOG_XP"
// 11: "DOTA_COMBATLOG_PURCHASE"
// 12: "DOTA_COMBATLOG_BUYBACK"
// 13: "DOTA_COMBATLOG_ABILITY_TRIGGER"
// 14: "DOTA_COMBATLOG_PLAYERSTATS" 
// 15: "DOTA_COMBATLOG_MULTIKILL"
// 16: "DOTA_COMBATLOG_KILLSTREAK"
// 17: "DOTA_COMBATLOG_TEAM_BUILDING_KILL"
// 18: "DOTA_COMBATLOG_FIRST_BLOOD"
// 19: "DOTA_COMBATLOG_MODIFIER_REFRESH"
// 20: "DOTA_COMBATLOG_NEUTRAL_CAMP_STACK"
// 21: "DOTA_COMBATLOG_PICKUP_RUNE"
// 22: "DOTA_COMBATLOG_REVEALED_INVISIBLE"
// 23: "DOTA_COMBATLOG_HERO_SAVED"
// 24: "DOTA_COMBATLOG_MANA_RESTORED"
// 25: "DOTA_COMBATLOG_HERO_LEVELUP"
// 26: "DOTA_COMBATLOG_BOTTLE_HEAL_ALLY"
// 27: "DOTA_COMBATLOG_ENDGAME_STATS"
// 28: "DOTA_COMBATLOG_INTERRUPT_CHANNEL"
// 29: "DOTA_COMBATLOG_ALLIED_GOLD"
// 30: "DOTA_COMBATLOG_AEGIS_TAKEN"
// 31: "DOTA_COMBATLOG_MANA_DAMAGE"
// 32: "DOTA_COMBATLOG_PHYSICAL_DAMAGE_PREVENTED"
// 33: "DOTA_COMBATLOG_UNIT_SUMMONED"
// 34: "DOTA_COMBATLOG_ATTACK_EVADE"
// 35: "DOTA_COMBATLOG_TREE_CUT"
// 36: "DOTA_COMBATLOG_SUCCESSFUL_SCAN"
// 37: "DOTA_COMBATLOG_END_KILLSTREAK"
// 38: "DOTA_COMBATLOG_BLOODSTONE_CHARGE"
// 39: "DOTA_COMBATLOG_CRITICAL_DAMAGE"
// 40: "DOTA_COMBATLOG_SPELL_ABSORB"

//https://sportdocbox.com/Olympics/68925293-Dota2-documentation-release.html