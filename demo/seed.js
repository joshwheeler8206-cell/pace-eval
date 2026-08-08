/* auto-generated demo seed for pace-eval */
var __SEED_DBS__ = {
"usaf_pace_eval_db": {
"key": "usaf_pace_evals_v1",
"value": [
{
"id": "p1",
"createdAt": "2026-07-28T08:00:00.000Z",
"driver": "Marcus Reed",
"exp": "CDL A",
"lic": "DRV-1024",
"evaluator": "J. Kowalski",
"date": "2026-07-28",
"sections": {
"plan": {
"ratings": {
"Examines Vehicle": 3,
"Plans Trip": 3,
"Driver Position / Safety Restraint": 1
},
"timed": {
"eye": {
"sec": 14,
"rating": 3
},
"mirror": {
"sec": 9,
"rating": 3
},
"following": {
"sec": 4,
"rating": 3
}
},
"notes": ""
},
"analyze": {
"ratings": {
"Identifies distant relevant objects": 3,
"Checks blind spots prior to lane change": 3,
"Clears intersection (L-R-L-R)": 1,
"Compensates for potential hazards": 1,
"Adjusts speed to meet environment": 2,
"Checks Mirror Regularly (Balanced)": 1
},
"timed": {
"eye": {
"sec": 14,
"rating": 3
},
"mirror": {
"sec": 9,
"rating": 3
},
"following": {
"sec": 4,
"rating": 3
}
},
"notes": ""
},
"comm": {
"ratings": {
"Proper use of lights": 3,
"Properly uses turn signals, flashers, brake lights": 1,
"Covers horn / sounds when needed": 1,
"Stays out of others blind spots": 1,
"Seeks eye contact with other drivers": 2
},
"timed": {
"eye": {
"sec": 14,
"rating": 3
},
"mirror": {
"sec": 9,
"rating": 3
},
"following": {
"sec": 4,
"rating": 3
}
},
"notes": ""
},
"exec": {
"ratings": {
"Maintains proper space around vehicle": 3,
"Choose lane of least resistance": 3,
"Keeps vehicle rolling by adjusting to traffic": 1,
"Drives within visibility limitations": 1,
"Stopping and proceeding at intersections": 1,
"Positions vehicle to eliminate risk (turning/backing)": 1
},
"timed": {
"eye": {
"sec": 14,
"rating": 3
},
"mirror": {
"sec": 9,
"rating": 3
},
"following": {
"sec": 4,
"rating": 3
}
},
"notes": ""
}
},
"overallNotes": "Strong PACE habits. Eye lead maintained 14s.",
"training": "On the job",
"trainingCompleteDate": "2026-06-15",
"clicker": 2,
"nextPaceDate": "2026-10-28",
"reviewDate": "2026-07-28",
"evaluatorSig": null,
"employeeSig": null
},
{
"id": "p2",
"createdAt": "2026-07-20T08:00:00.000Z",
"driver": "Alicia Santos",
"exp": "CDL A",
"lic": "DRV-1087",
"evaluator": "S. Nakamura",
"date": "2026-07-20",
"sections": {
"plan": {
"ratings": {
"Examines Vehicle": 3,
"Plans Trip": 3,
"Driver Position / Safety Restraint": 1
},
"timed": {
"eye": {
"sec": 11,
"rating": 2
},
"mirror": {
"sec": 12,
"rating": 2
},
"following": {
"sec": 3,
"rating": 2
}
},
"notes": ""
},
"analyze": {
"ratings": {
"Identifies distant relevant objects": 1,
"Checks blind spots prior to lane change": 1,
"Clears intersection (L-R-L-R)": 3,
"Compensates for potential hazards": 1,
"Adjusts speed to meet environment": 3,
"Checks Mirror Regularly (Balanced)": 2
},
"timed": {
"eye": {
"sec": 11,
"rating": 2
},
"mirror": {
"sec": 12,
"rating": 2
},
"following": {
"sec": 3,
"rating": 2
}
},
"notes": ""
},
"comm": {
"ratings": {
"Proper use of lights": 1,
"Properly uses turn signals, flashers, brake lights": 3,
"Covers horn / sounds when needed": 1,
"Stays out of others blind spots": 1,
"Seeks eye contact with other drivers": 1
},
"timed": {
"eye": {
"sec": 11,
"rating": 2
},
"mirror": {
"sec": 12,
"rating": 2
},
"following": {
"sec": 3,
"rating": 2
}
},
"notes": ""
},
"exec": {
"ratings": {
"Maintains proper space around vehicle": 1,
"Choose lane of least resistance": 1,
"Keeps vehicle rolling by adjusting to traffic": 1,
"Drives within visibility limitations": 1,
"Stopping and proceeding at intersections": 1,
"Positions vehicle to eliminate risk (turning/backing)": 1
},
"timed": {
"eye": {
"sec": 11,
"rating": 2
},
"mirror": {
"sec": 12,
"rating": 2
},
"following": {
"sec": 3,
"rating": 2
}
},
"notes": ""
}
},
"overallNotes": "Mirror interval drifting \u2014 coach cadence.",
"training": "On the job",
"trainingCompleteDate": "",
"clicker": 5,
"nextPaceDate": "2026-10-20",
"reviewDate": "2026-07-20",
"evaluatorSig": null,
"employeeSig": null
}
]
},
"usaf_roster_db": {
"key": "usaf_roster_v1",
"value": [
{
"name": "Marcus Reed",
"license": "DRV-1024",
"warehouse": "OKC North",
"hireDate": "2021-09-10",
"trainer": "J. Kowalski"
},
{
"name": "Alicia Santos",
"license": "DRV-1087",
"warehouse": "OKC North",
"hireDate": "2022-08-15",
"trainer": "S. Nakamura"
},
{
"name": "Darrell Whitfield",
"license": "DRV-1102",
"warehouse": "Tulsa Yard",
"hireDate": "2019-04-02",
"trainer": "T. Beaumont"
},
{
"name": "Kyle Osei",
"license": "TRN-2001",
"warehouse": "OKC North",
"hireDate": "2026-05-01",
"trainer": "B. Tran"
},
{
"name": "Rebecca Hall",
"license": "TRN-2007",
"warehouse": "Dallas Metro",
"hireDate": "2026-07-06",
"trainer": "S. Nakamura"
}
]
}
};

function __seedPut__(dbName, key, value) {
  return new Promise(function (res, rej) {
    var rq = indexedDB.open(dbName, 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
    rq.onsuccess = function () {
      var db = rq.result;
      var tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = function () { db.close(); res(); };
      tx.onerror = function () { db.close(); rej(tx.error); };
    };
    rq.onerror = function () { rej(rq.error); };
  });
}
var __seedChain__ = Promise.resolve();
Object.keys(__SEED_DBS__).forEach(function (db) {
  var key = __SEED_DBS__[db].key, val = __SEED_DBS__[db].value;
  __seedChain__ = __seedChain__.then(function () {
    return __seedPut__(db, key, val).then(function () {
      if (console && console.log) console.log('seeded', db, key, JSON.stringify(val).length + 'B');
    }, function (e) { if (console) console.warn('seed fail', db, e); });
  });
});
