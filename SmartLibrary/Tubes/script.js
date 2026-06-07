// =============================================
// FIREBASE CONFIG
// =============================================
const firebaseConfig = {
  apiKey:            "AIzaSyAbnJUUO4bXgYZf-bAbXCnpsUNspaaFw6Q",
  authDomain:        "smartlibrarydatabase-7a97d.firebaseapp.com",
  databaseURL:       "https://smartlibrarydatabase-7a97d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "smartlibrarydatabase-7a97d",
  storageBucket:     "smartlibrarydatabase-7a97d.firebasestorage.app",
  messagingSenderId: "387000755469",
  appId:             "1:387000755469:web:3140ee1b76843362e0fc44"
};

// Inisialisasi Firebase (cegah duplikasi jika script di-reload)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db      = firebase.database();
const logsRef = db.ref("library_logs");

// Update status sync di sidebar
function updateSyncStatus(connected) {
  const dot   = document.querySelector("#firebase-sync-status .sync-dot");
  const label = document.getElementById("sync-label");
  if (!dot || !label) return;

  if (connected) {
    dot.classList.add("connected");
    label.textContent = "Tersinkron ke Database";
  } else {
    dot.classList.remove("connected");
    label.textContent = "Tidak Terhubung";
  }
}

db.ref(".info/connected").on("value", snap => {
  updateSyncStatus(snap.val() === true);
});

// =====================
// AUDIO MODEL
// =====================

const URL_AUDIO =
  "https://teachablemachine.withgoogle.com/models/azF9Qfx9T/";

let modelPeople;
let modelAudio;
let stream;

let isRunning = false;

let peopleCount = 0;

let audioState =
  "Background Noise";

let lastState = "";

let audioCooldown = false;

const panel =
  document.getElementById("cam-panel");

const badge =
  document.getElementById("result-badge");

// =====================
// CHART.JS / WEEKLY STATS VARIABLES & HELPERS
// =====================
let currentNoiseLevel = 0;
let capacityChartInstance = null;
let noiseChartInstance = null;
let noiseSamplerInterval = null;

// CLOCK
setInterval(() => {

  const now =
    new Date();

  document.getElementById("clock").textContent =
    now.toLocaleTimeString("id-ID");

}, 1000);

// START SYSTEM
async function startSystem(){

  try{

    document.getElementById(
      "start-screen"
    ).style.display = "none";

    document.getElementById(
      "status-system"
    ).textContent =
      "Status: Memuat AI...";

    // LOAD MODEL
    modelPeople =
      await cocoSsd.load();

    // CAMERA + MICROPHONE
    const video =
      document.getElementById("webcam");

    stream =
      await navigator.mediaDevices.getUserMedia({
        video:true,
        audio:true
      });

    video.srcObject = stream;

    video.onloadedmetadata = async () => {

      const canvas =
        document.getElementById("overlay");

      canvas.width =
        video.videoWidth;

      canvas.height =
        video.videoHeight;

      // AUDIO MODEL
      await loadAudioModel();

      isRunning = true;

      document.getElementById(
        "status-system"
      ).textContent =
        "Status: Sistem Aktif";

      // Log sistem online ke Firebase
      pushLog("SISTEM ONLINE", "Sistem AI berhasil diaktifkan dan mulai memantau ruangan.");

      // Instantly update/sync charts when system starts
      updateChartsData();

      startNoiseSampler();

      detectFrame();
    };

  } catch(err){

    alert(
      "Izinkan akses kamera dan mikrofon."
    );

    console.log(err);
  }
}

// =====================
// AUDIO DETECTION
// =====================

async function loadAudioModel(){
  try {
    const checkpointURL = URL_AUDIO + "model.json";
    const metadataURL = URL_AUDIO + "metadata.json";

    modelAudio = speechCommands.create(
      "BROWSER_FFT", 
      null, 
      checkpointURL, 
      metadataURL
    );

    if (!modelAudio) {
      throw new Error("Objek modelAudio gagal dibuat oleh speechCommands.");
    }

    await modelAudio.ensureModelLoaded();

    modelAudio.listen((result) => {
      
      const labels = modelAudio.wordLabels();
      let highest = 0;
      let detectedClass = "";

      for(let i=0; i<labels.length; i++){
        const label = labels[i];
        const probability = result.scores[i];

        // BACKGROUND NOISE
        if(label === "Background Noise"){
          document.getElementById("noise-normal").textContent = (probability * 100).toFixed(1) + "%";
          document.getElementById("noise-normal-bar").style.width = (probability * 100) + "%";
        }

        // BERISIK
        if(label === "Berisik"){
          document.getElementById("noise-berisik").textContent = (probability * 100).toFixed(1) + "%";
          document.getElementById("noise-berisik-bar").style.width = (probability * 100) + "%";
          currentNoiseLevel = probability * 100;
        }

        if(probability > highest){
          highest = probability;
          detectedClass = label;
        }
      }

      audioState = detectedClass;
      updateSystemUI();

    }, {
      includeSpectrogram: true,
      probabilityThreshold: 0.70,
      overlapFactor: 0.5
    });

  } catch(error){
    console.error("Detail Error Audio:", error);
    alert("Model audio gagal dimuat. Cek Console untuk detailnya.");
  }
}

// =====================
// PEOPLE DETECTION
// =====================

async function detectFrame(){

  if(!isRunning) return;

  const video =
    document.getElementById("webcam");

  const predictions =
    await modelPeople.detect(video);

  const people =
    predictions.filter(
      p => p.class === "person"
    );

  peopleCount =
    people.length;

  document.getElementById(
    "people-count"
  ).textContent =
    peopleCount;

  drawBoxes(people);

  updateSystemUI();

  requestAnimationFrame(detectFrame);
}

// DRAW BOX
function drawBoxes(people){

  const canvas =
    document.getElementById("overlay");

  const ctx =
    canvas.getContext("2d");

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  people.forEach(person => {

    const [x,y,w,h] =
      person.bbox;

    ctx.strokeStyle =
      peopleCount >= 4
      ? "#ff3c5a"
      : "#00ff9d";

    ctx.lineWidth = 3;

    ctx.strokeRect(
      x,y,w,h
    );

    ctx.fillStyle =
      peopleCount >= 4
      ? "#ff3c5a"
      : "#00ff9d";

    ctx.font =
      "bold 12px Arial";

    ctx.save();
    ctx.scale(-1, 1);
    
    ctx.fillText(
      "PENGUNJUNG",
      -(x + w),
      y > 15 ? y - 5 : 15
    );
    
    ctx.restore();

  });
}

// =====================
// UPDATE UI
// =====================

function updateSystemUI(){

  if(!isRunning) return;


  // Update peak capacity for today ke Firebase
  const keys = getActiveKeys();
  const capRef = db.ref("weekly_stats/" + keys.capacityKey.replace(/\//g, "-"));
  capRef.once("value").then(snap => {
    const currentMax = parseInt(snap.val()) || 0;
    if (peopleCount > currentMax) {
      capRef.set(peopleCount);
    }
  });


  const roomStatus =
    document.getElementById("room-status");

  const warningAudio =
    document.getElementById("warning-audio");

  // ROOM FULL
  if(peopleCount >= 4){

    panel.style.borderColor =
      "#ff3c5a";

    badge.style.color =
      "#ff3c5a";

    badge.style.borderColor =
      "#ff3c5a";

    badge.innerHTML =
      `RUANGAN PENUH<br>${peopleCount}/4 ORANG`;

    roomStatus.innerHTML =
      `
        🔴 Kapasitas ruangan penuh.<br>
        Pengunjung tidak diperbolehkan masuk.
      `;

    addLog(
      "RUANGAN PENUH",
      `Kapasitas terdeteksi ${peopleCount}/4 orang. Pengunjung tidak dapat masuk.`
    );
  }

  // BERISIK
  else if(audioState === "Berisik"){

    panel.style.borderColor =
      "#ffb800";

    badge.style.color =
      "#ffb800";

    badge.style.borderColor =
      "#ffb800";

    badge.innerHTML =
      `HARAP TENANG`;

    roomStatus.innerHTML =
      `
        🟡 Terdeteksi suara berisik.<br>
        Mohon menjaga ketenangan perpustakaan.
      `;

    if(!audioCooldown){

      warningAudio.play();

      audioCooldown = true;

      setTimeout(() => {

        audioCooldown = false;

      }, 150);
    }

    addLog(
      "SUARA BERISIK",
      "Terdeteksi kebisingan melebihi ambang batas. Mohon jaga ketenangan."
    );
  }

  // SAFE
  else {

    panel.style.borderColor =
      "#00ff9d";

    badge.style.color =
      "#00ff9d";

    badge.style.borderColor =
      "#00ff9d";

    badge.innerHTML =
      `RUANGAN KONDUSIF`;

    roomStatus.innerHTML =
      `
        🟢 Kapasitas ruangan aman.<br>
        Suasana perpustakaan kondusif.
      `;

    addLog(
      "RUANGAN AMAN",
      `Kapasitas ${peopleCount}/4 orang. Suasana perpustakaan kondusif dan tenang.`
    );
  }
}

// =====================
// LOG - PUSH KE FIREBASE
// =====================

// Keterangan default per status (dipakai jika parameter keterangan tidak disertakan)
const keteranganDefault = {
  "RUANGAN PENUH":  "Kapasitas ruangan telah penuh.",
  "SUARA BERISIK":  "Terdeteksi kebisingan di dalam ruangan.",
  "RUANGAN AMAN":   "Ruangan dalam kondisi normal.",
  "SISTEM ONLINE":  "Sistem berhasil diaktifkan.",
  "SISTEM OFFLINE": "Sistem dihentikan oleh operator."
};

function addLog(statusText, keterangan) {

  // Cegah log duplikat berturut-turut untuk status yang sama
  if(lastState === statusText) return;
  lastState = statusText;

  // Push data log ke Firebase Realtime Database
  pushLog(statusText, keterangan);
}

function pushLog(statusText, keterangan) {
  const ket = keterangan || keteranganDefault[statusText] || "-";

  logsRef.push({
    timestamp:  firebase.database.ServerValue.TIMESTAMP,
    status:     statusText,
    keterangan: ket
  })
  .then(() => {
    console.log(`[Firebase] Log berhasil dikirim: ${statusText}`);
  })
  .catch(err => {
    console.error("[Firebase] Gagal mengirim log:", err);
  });
}

// =====================
// STOP SYSTEM
// =====================

function stopSystem(){

  isRunning = false;

  if(stream){

    stream.getTracks().forEach(
      track => track.stop()
    );
  }

  if(modelAudio){

    modelAudio.stopListening();
  }

  if (noiseSamplerInterval) {
    clearInterval(noiseSamplerInterval);
    noiseSamplerInterval = null;
  }

  // Log sistem offline ke Firebase
  pushLog("SISTEM OFFLINE", "Sistem dihentikan oleh operator. Pemantauan ruangan berhenti.");

  // Instantly update/sync charts when system stops
  updateChartsData();

  document.getElementById(
    "start-screen"
  ).style.display = "flex";

  document.getElementById(
    "status-system"
  ).textContent =
    "Status: Offline";

  badge.innerHTML =
    "SYSTEM STOPPED";
}

// =====================
// CHART.JS / WEEKLY STATS FUNCTIONS
// =====================

// Cache lokal data Firebase biar grafik bisa update tanpa nunggu
const chartCache = { capacity: {}, noise: {} };

// Firebase refs untuk weekly stats
const weeklyStatsRef = db.ref("weekly_stats");

// Listen realtime — kapanpun data berubah di Firebase, grafik ikut update
weeklyStatsRef.on("value", snap => {
  const data = snap.val() || {};
  // Parse semua key ke cache
  Object.keys(data).forEach(k => {
    const val = data[k];
    if (k.startsWith("Maks-")) {
      chartCache.capacity[k] = parseInt(val) || 0;
    } else if (k.startsWith("Noise-")) {
      chartCache.noise[k] = typeof val === "object" ? val : { average: parseFloat(val) || 0, count: 1 };
    }
  });
  updateChartsData();
});

function getDaysOfCurrentWeek() {
  const now = new Date();
  const currentDay = now.getDay();
  const dayOffset = currentDay === 0 ? 7 : currentDay;
  const days = [];
  const dayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + (i - dayOffset));
    const dayName = dayNames[i - 1];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    days.push({
      name: dayName,
      keyDate: `${dd}-${mm}-${yyyy}`,
      labelDate: `${dd}/${mm}`,
    });
  }
  return days;
}

function getActiveKeys() {
  const now = new Date();
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayName = dayNames[now.getDay()];
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return {
    capacityKey: `Maks-${dayName}-${dd}-${mm}-${yyyy}`,
    noiseKey:    `Noise-${dayName}-${dd}-${mm}-${yyyy}`
  };
}

function initializeCharts() {
  if (!document.getElementById("charts-style")) {
    const style = document.createElement("style");
    style.id = "charts-style";
    style.textContent = `
      .charts-grid {
        grid-column: span 2;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        margin-top: 24px;
      }
      @media (max-width: 920px) {
        .charts-grid { grid-column: span 1; grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  let chartsGrid = document.querySelector(".charts-grid");
  if (!chartsGrid) {
    const mainGrid = document.querySelector(".main-grid");
    if (mainGrid) {
      chartsGrid = document.createElement("div");
      chartsGrid.className = "charts-grid";
      chartsGrid.innerHTML = `
        <div class="card">
          <div class="card-title">📊 Kapasitas Maksimal Pengunjung Harian</div>
          <div class="card-body" style="position: relative; height: 300px;">
            <canvas id="capacityChart"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-title">📈 Rata-Rata Kebisingan Harian (%)</div>
          <div class="card-body" style="position: relative; height: 300px;">
            <canvas id="noiseChart"></canvas>
          </div>
        </div>
      `;
      mainGrid.appendChild(chartsGrid);
    }
  }

  const weekDays = getDaysOfCurrentWeek();
  const labels = weekDays.map(d => `${d.name} (${d.labelDate})`);
  const emptyData = weekDays.map(() => 0);

  const ctxCapacity = document.getElementById("capacityChart").getContext("2d");
  const ctxNoise    = document.getElementById("noiseChart").getContext("2d");

  if (capacityChartInstance) capacityChartInstance.destroy();
  if (noiseChartInstance)    noiseChartInstance.destroy();

  capacityChartInstance = new Chart(ctxCapacity, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Jumlah Orang Maksimal",
        data: emptyData,
        backgroundColor: "rgba(5, 150, 105, 0.7)",
        borderColor: "rgba(5, 150, 105, 1)",
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
    }
  });

  noiseChartInstance = new Chart(ctxNoise, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Rata-Rata Kebisingan (%)",
        data: emptyData,
        backgroundColor: "rgba(217, 119, 6, 0.7)",
        borderColor: "rgba(217, 119, 6, 1)",
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" } } }
    }
  });
}

function updateChartsData() {
  if (!capacityChartInstance || !noiseChartInstance) return;

  const weekDays = getDaysOfCurrentWeek();

  const capacityData = weekDays.map(day =>
    chartCache.capacity[day.keyDate.replace(/(\d{2})-(\d{2})-(\d{4})/, (_, dd, mm, yyyy) => `Maks-${["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"][new Date(`${yyyy}-${mm}-${dd}`).getDay()]}-${dd}-${mm}-${yyyy}`)] || 0
  );

  const noiseData = weekDays.map(day => {
    const dayNames = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    const [dd, mm, yyyy] = day.keyDate.split("-");
    const dayName = dayNames[new Date(`${yyyy}-${mm}-${dd}`).getDay()];
    const key = `Noise-${dayName}-${dd}-${mm}-${yyyy}`;
    const entry = chartCache.noise[key];
    if (!entry) return 0;
    return parseFloat((entry.average || 0).toFixed(1));
  });

  capacityChartInstance.data.datasets[0].data = capacityData;
  noiseChartInstance.data.datasets[0].data    = noiseData;
  capacityChartInstance.update();
  noiseChartInstance.update();
}

function startNoiseSampler() {
  if (noiseSamplerInterval) clearInterval(noiseSamplerInterval);

  noiseSamplerInterval = setInterval(() => {
    if (!isRunning) return;

    const keys     = getActiveKeys();
    const noiseRef = db.ref("weekly_stats/" + keys.noiseKey);

    noiseRef.once("value").then(snap => {
      const stored = snap.val();
      let avg = 0, count = 0;
      if (stored && typeof stored === "object") {
        avg   = stored.average || 0;
        count = stored.count   || 0;
      }
      const newCount = count + 1;
      const newAvg   = ((avg * count) + currentNoiseLevel) / newCount;
      noiseRef.set({ average: newAvg, count: newCount });
    });

  }, 3000);
}

// Load Chart.js dynamically and initialize
if (typeof Chart === "undefined") {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/chart.js";
  script.onload = () => { initializeCharts(); };
  document.head.appendChild(script);
} else {
  initializeCharts();
}

