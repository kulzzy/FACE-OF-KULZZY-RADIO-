/* =========================================================
   FACE OF KULZZY RADIO 2026
   COMPLETE ADMIN SYSTEM

   Existing features:
   - Firebase administrator login
   - Add contestants
   - Upload contestant photos to Cloudinary
   - Edit contestants
   - Hide and publish contestants
   - Delete contestants
   - Refresh contestant list

   Added features:
   - Official vote totals
   - Manually record confirmed payments
   - Save voter names and timestamps
   - Keep payment amounts and voter emails private
   - Generate unique contestant share links
   ========================================================= */


/* ================= FIREBASE CONFIG ================= */

const firebaseConfig = {
    apiKey: "AIzaSyD-Oqmq3P5bNoxcHBdkTAw7O9W9HVsKDVc",
    authDomain: "face-of-kulzzy-radio-2026.firebaseapp.com",
    databaseURL: "https://face-of-kulzzy-radio-2026-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "face-of-kulzzy-radio-2026",
    storageBucket: "face-of-kulzzy-radio-2026.firebasestorage.app",
    messagingSenderId: "175657004245",
    appId: "1:175657004245:web:022d50bc14ed86e036065c",
    measurementId: "G-WQDFT2B0RH"
};


/* ================= FIREBASE IMPORTS ================= */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getDatabase,
    ref,
    push,
    set,
    update,
    remove,
    onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";


/* ================= INITIALIZE FIREBASE ================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);


/* ================= ADMIN ACCOUNT ================= */

const ADMIN_EMAIL = "dstnewz.ng@gmail.com";


/* ================= CLOUDINARY ================= */

const CLOUDINARY_CLOUD_NAME = "s4j0x7dk";
const CLOUDINARY_UPLOAD_PRESET = "face-of-kulzzy-radio-2026";


/* ================= SHORTCUT ================= */

const $ = id => document.getElementById(id);


/* ================= DATA ================= */

let contestants = {};
let officialVoteTotals = {};

let contestantsUnsubscribe = null;
let votesUnsubscribe = null;

let votePanelCreated = false;


/* ================= LOGIN ================= */

$("loginBtn").addEventListener("click", login);

async function login() {
    const email = $("email").value.trim();
    const password = $("password").value;

    if (!email || !password) {
        $("loginStatus").textContent =
            "Please enter your email and password.";
        return;
    }

    $("loginBtn").disabled = true;
    $("loginStatus").textContent = "Logging in...";

    try {
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        $("loginStatus").textContent = "";

    } catch (error) {
        console.error(error);

        $("loginStatus").textContent =
            friendlyError(error);

    } finally {
        $("loginBtn").disabled = false;
    }
}


/* ================= AUTH STATE ================= */

onAuthStateChanged(auth, user => {
    if (user && user.email === ADMIN_EMAIL) {
        $("loginPanel").classList.add("hidden");
        $("adminPanel").classList.remove("hidden");

        loadContestants();
        loadOfficialVotes();
        createVoteControlPanel();

        return;
    }

    stopAdminListeners();

    $("loginPanel").classList.remove("hidden");
    $("adminPanel").classList.add("hidden");

    if (user) {
        signOut(auth);
        $("loginStatus").textContent =
            "This account is not authorized to administer the contest.";
    }
});


function stopAdminListeners() {
    if (contestantsUnsubscribe) {
        contestantsUnsubscribe();
        contestantsUnsubscribe = null;
    }

    if (votesUnsubscribe) {
        votesUnsubscribe();
        votesUnsubscribe = null;
    }
}


/* ================= FRIENDLY ERRORS ================= */

function friendlyError(error) {
    const code = error?.code || "";

    if (
        code.includes("invalid-credential") ||
        code.includes("wrong-password")
    ) {
        return "Incorrect email or password.";
    }

    if (code.includes("user-not-found")) {
        return "Admin account not found.";
    }

    if (code.includes("too-many-requests")) {
        return "Too many login attempts. Try again later.";
    }

    return error?.message || "Login failed.";
}


/* ================= PHOTO PREVIEW ================= */

$("photoFile").addEventListener("change", () => {
    const file = $("photoFile").files[0];

    if (!file) return;

    $("preview").src = URL.createObjectURL(file);
});


/* ================= CLOUDINARY UPLOAD ================= */

async function uploadImage(file) {
    const formData = new FormData();

    formData.append("file", file);

    formData.append(
        "upload_preset",
        CLOUDINARY_UPLOAD_PRESET
    );

    formData.append(
        "folder",
        "face-of-kulzzy-radio-2026"
    );

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
            method: "POST",
            body: formData
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.error?.message || "Image upload failed."
        );
    }

    return data.secure_url;
}


/* ================= SAVE CONTESTANT ================= */

$("saveBtn").addEventListener("click", saveContestant);

async function saveContestant() {
    const user = auth.currentUser;

    if (!user || user.email !== ADMIN_EMAIL) {
        $("formStatus").textContent =
            "Administrator login is required.";
        return;
    }

    const number = $("contestantNo").value.trim();
    const name = $("contestantName").value.trim();
    const url = $("photoUrl").value.trim();
    const file = $("photoFile").files[0];
    const editId = $("editId").value;

    if (!number) {
        $("formStatus").textContent =
            "Enter contestant number.";
        return;
    }

    if (!name) {
        $("formStatus").textContent =
            "Enter contestant name.";
        return;
    }

    if (!file && !url && !editId) {
        $("formStatus").textContent =
            "Upload a contestant picture or enter an image URL.";
        return;
    }

    $("saveBtn").disabled = true;

    try {
        let imageUrl = url;

        if (file) {
            $("formStatus").textContent =
                "Uploading contestant picture...";

            imageUrl = await uploadImage(file);
        }

        let contestantId = editId;
        const oldData = editId ? contestants[editId] : null;

        if (!contestantId) {
            contestantId = push(
                ref(db, "faceOfKulzzy/contestants")
            ).key;
        }

        const contestant = {
            number,
            name,
            imageUrl,

            votes: Number(oldData?.votes || 0),
            money: Number(oldData?.money || 0),

            active: oldData?.active !== false,

            createdAt: oldData?.createdAt || Date.now(),
            updatedAt: Date.now()
        };

        await set(
            ref(
                db,
                `faceOfKulzzy/contestants/${contestantId}`
            ),
            contestant
        );

        $("formStatus").textContent = editId
            ? "Contestant updated successfully."
            : "Contestant published successfully.";

        clearForm();

    } catch (error) {
        console.error(error);

        $("formStatus").textContent =
            "Error: " + error.message;

    } finally {
        $("saveBtn").disabled = false;
    }
}


/* ================= LOAD CONTESTANTS ================= */

function loadContestants() {
    $("listStatus").textContent = "Loading contestants...";

    if (contestantsUnsubscribe) {
        contestantsUnsubscribe();
    }

    contestantsUnsubscribe = onValue(
        ref(db, "faceOfKulzzy/contestants"),

        snapshot => {
            contestants = snapshot.val() || {};

            renderContestants();

            $("listStatus").textContent =
                Object.keys(contestants).length +
                " contestant(s) found.";
        },

        error => {
            console.error(error);

            $("listStatus").textContent =
                "Error loading contestants: " +
                error.message;
        }
    );
}


/* ================= LOAD OFFICIAL VOTES ================= */

function loadOfficialVotes() {
    if (votesUnsubscribe) {
        votesUnsubscribe();
    }

    votesUnsubscribe = onValue(
        ref(db, "faceOfKulzzy/officialVotes"),

        snapshot => {
            officialVoteTotals = snapshot.val() || {};

            renderContestants();
            renderVoteContestants();
        },

        error => {
            console.error(error);
        }
    );
}


/* ================= GET OFFICIAL VOTE COUNT ================= */

function getOfficialVoteCount(id) {
    const entry = officialVoteTotals[id];

    const value =
        entry && typeof entry === "object"
            ? entry.votes || 0
            : entry || 0;

    const total = Number(value);

    return Number.isSafeInteger(total) && total >= 0
        ? total
        : 0;
}


/* ================= DISPLAY CONTESTANTS ================= */

function renderContestants() {
    const rows = $("contestantRows");

    if (!rows) return;

    rows.innerHTML = "";

    const list = Object.entries(contestants);

    list.sort((a, b) =>
        String(a[1].number || "").localeCompare(
            String(b[1].number || ""),
            undefined,
            { numeric: true }
        )
    );

    list.forEach(([id, contestant]) => {
        const row = document.createElement("tr");

        const voteCount = getOfficialVoteCount(id);

        row.innerHTML = `
            <td>
                <img
                    class="thumb"
                    src="${escapeHTML(contestant.imageUrl || "")}"
                    alt="Contestant"
                >
            </td>

            <td>${escapeHTML(contestant.number || "")}</td>

            <td>${escapeHTML(contestant.name || "")}</td>

            <td>${voteCount.toLocaleString()}</td>

            <td>₦${Number(
                contestant.money || 0
            ).toLocaleString()}</td>

            <td>
                ${contestant.active === false
                    ? "HIDDEN"
                    : "PUBLISHED"}
            </td>

            <td>
                <button
                    class="secondary"
                    data-edit="${escapeHTML(id)}"
                >EDIT</button>

                <button
                    class="secondary"
                    data-toggle="${escapeHTML(id)}"
                >${contestant.active === false
                    ? "PUBLISH"
                    : "HIDE"}</button>

                <button
                    class="danger"
                    data-delete="${escapeHTML(id)}"
                >DELETE</button>

                <button
                    class="primary"
                    data-share="${escapeHTML(id)}"
                >SHARE LINK</button>
            </td>
        `;

        rows.appendChild(row);
    });

    rows.querySelectorAll("[data-edit]").forEach(button => {
        button.onclick = () =>
            editContestant(button.dataset.edit);
    });

    rows.querySelectorAll("[data-toggle]").forEach(button => {
        button.onclick = () =>
            toggleContestant(button.dataset.toggle);
    });

    rows.querySelectorAll("[data-delete]").forEach(button => {
        button.onclick = () =>
            deleteContestant(button.dataset.delete);
    });

    rows.querySelectorAll("[data-share]").forEach(button => {
        button.onclick = () =>
            copyContestantLink(button.dataset.share);
    });
}


/* ================= UNIQUE CONTESTANT SHARE LINK ================= */

async function copyContestantLink(id) {
    const link = new URL(
        "contestant-voters.html?id=" + encodeURIComponent(id),
        window.location.href
    ).href;

    try {
        await navigator.clipboard.writeText(link);

        alert(
            "Contestant share link copied:\n\n" + link
        );

    } catch (error) {
        prompt(
            "Copy this contestant share link:",
            link
        );
    }
}


/* ================= EDIT CONTESTANT ================= */

function editContestant(id) {
    const contestant = contestants[id];

    if (!contestant) return;

    $("editId").value = id;
    $("contestantNo").value = contestant.number || "";
    $("contestantName").value = contestant.name || "";
    $("photoUrl").value = contestant.imageUrl || "";
    $("preview").src = contestant.imageUrl || "";

    $("formStatus").textContent =
        "Editing contestant #" + contestant.number;

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* ================= HIDE / PUBLISH ================= */

async function toggleContestant(id) {
    const contestant = contestants[id];

    if (!contestant) return;

    try {
        await update(
            ref(db, `faceOfKulzzy/contestants/${id}`),
            {
                active: contestant.active === false,
                updatedAt: Date.now()
            }
        );
    } catch (error) {
        alert("Could not update contestant: " + error.message);
    }
}


/* ================= DELETE CONTESTANT ================= */

async function deleteContestant(id) {
    const contestant = contestants[id];

    if (!contestant) return;

    const confirmed = confirm(
        "Delete contestant #" +
        contestant.number +
        " — " +
        contestant.name +
        "?"
    );

    if (!confirmed) return;

    try {
        await remove(
            ref(db, `faceOfKulzzy/contestants/${id}`)
        );
    } catch (error) {
        alert("Could not delete contestant: " + error.message);
    }
}


/* ================= CLEAR FORM ================= */

$("clearBtn").addEventListener("click", clearForm);

function clearForm() {
    $("editId").value = "";
    $("contestantNo").value = "";
    $("contestantName").value = "";
    $("photoUrl").value = "";
    $("photoFile").value = "";

    $("preview").removeAttribute("src");

    $("formStatus").textContent = "";
}


/* ================= REFRESH ================= */

$("refreshBtn").addEventListener("click", () => {
    loadContestants();
    loadOfficialVotes();
});


/* ================= LOGOUT ================= */

$("logoutBtn").addEventListener("click", () => {
    signOut(auth);
});


/* =========================================================
   OFFICIAL VOTE CONTROL PANEL
   ========================================================= */

function createVoteControlPanel() {
    if (votePanelCreated) return;

    const adminPanel = $("adminPanel");

    if (!adminPanel) return;

    const panel = document.createElement("div");

    panel.className = "panel";
    panel.id = "kulzzyVoteControlPanel";

    panel.innerHTML = `
        <h2>🗳️ OFFICIAL VOTE CONTROL</h2>

        <p style="color:#b9c6da;line-height:1.7">
            Confirm payment independently before recording votes.
            Recorded votes update the official leaderboard.
        </p>

        <div id="kulzzyVoteContestantList">
            Loading contestants...
        </div>

        <hr style="border-color:#29466f;margin:24px 0">

        <h3 style="color:#ffd700">
            RECORD CONFIRMED PAYMENT
        </h3>

        <label for="kulzzyVoteContestant">
            Select contestant
        </label>

        <select id="kulzzyVoteContestant"
            style="
                width:100%;
                padding:13px;
                margin:8px 0 16px;
                background:#06122a;
                color:white;
                border:1px solid #29466f;
                border-radius:10px;
            ">
            <option value="">Select contestant</option>
        </select>

        <label for="kulzzyVoterName">Voter's name</label>
        <input id="kulzzyVoterName"
            type="text"
            placeholder="Enter voter name">

        <br><br>

        <label for="kulzzyVoterEmail">
            Voter's email (optional)
        </label>

        <input id="kulzzyVoterEmail"
            type="email"
            placeholder="Optional email address">

        <br><br>

        <label for="kulzzyVoteCount">
            Number of votes
        </label>

        <input id="kulzzyVoteCount"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            placeholder="Enter votes">

        <br><br>

        <label for="kulzzyConfirmedAmount">
            Confirmed payment amount (₦)
        </label>

        <input id="kulzzyConfirmedAmount"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            placeholder="Enter amount received">

        <p style="
            color:#b9c6da;
            font-size:13px;
            line-height:1.7;
            margin-top:12px;
        ">
            Payment amounts and voter emails are kept in the
            administrator-only database area. Public pages show
            voter names, votes and date/time only.
        </p>

        <button
            id="kulzzyRecordConfirmedVote"
            class="primary"
            type="button"
            style="width:100%;margin-top:16px"
        >
            RECORD CONFIRMED VOTE
        </button>

        <div id="kulzzyVoteControlStatus"
            class="status"></div>
    `;

    adminPanel.appendChild(panel);

    $("kulzzyRecordConfirmedVote").addEventListener(
        "click",
        recordConfirmedVote
    );

    votePanelCreated = true;
}


/* ================= DISPLAY VOTE CONTROL LIST ================= */

function renderVoteContestants() {
    const list = $("kulzzyVoteContestantList");
    const selector = $("kulzzyVoteContestant");

    if (!list || !selector) return;

    const previousSelection = selector.value;

    const entries = Object.entries(contestants).sort(
        (a, b) =>
            String(a[1].number || "").localeCompare(
                String(b[1].number || ""),
                undefined,
                { numeric: true }
            )
    );

    selector.innerHTML =
        '<option value="">Select contestant</option>';

    if (!entries.length) {
        list.textContent = "No contestants found.";
        return;
    }

    const fragments = document.createDocumentFragment();

    entries.forEach(([id, contestant]) => {
        const option = document.createElement("option");

        option.value = id;

        option.textContent =
            "#" + (contestant.number || "") +
            " — " + (contestant.name || "Contestant");

        selector.appendChild(option);

        const card = document.createElement("div");

        card.style.cssText =
            "padding:14px 0;border-bottom:1px solid rgba(255,255,255,.12)";

        const title = document.createElement("strong");

        title.style.color = "#ffd700";

        title.textContent =
            "#" + (contestant.number || "") +
            " — " + (contestant.name || "Contestant");

        const total = document.createElement("p");

        total.style.cssText =
            "margin:10px 0;font-weight:900";

        total.textContent =
            "OFFICIAL VOTES: " +
            getOfficialVoteCount(id).toLocaleString();

        const share = document.createElement("button");

        share.type = "button";
        share.className = "primary";
        share.textContent = "COPY SHARE LINK";

        share.addEventListener("click", () => {
            copyContestantLink(id);
        });

        const record = document.createElement("button");

        record.type = "button";
        record.className = "secondary";
        record.style.marginLeft = "8px";
        record.textContent = "RECORD VOTE";

        record.addEventListener("click", () => {
            selector.value = id;

            $("kulzzyVoterName").focus();

            $("kulzzyVoteControlPanel").scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });

        card.appendChild(title);
        card.appendChild(total);
        card.appendChild(share);
        card.appendChild(record);

        fragments.appendChild(card);
    });

    list.replaceChildren(fragments);

    if (previousSelection && contestants[previousSelection]) {
        selector.value = previousSelection;
    }
}


/* ================= RECORD CONFIRMED VOTE ================= */

async function recordConfirmedVote() {
    const status = $("kulzzyVoteControlStatus");
    const button = $("kulzzyRecordConfirmedVote");

    const user = auth.currentUser;

    if (!user || user.email !== ADMIN_EMAIL) {
        status.textContent =
            "Administrator access is required.";
        return;
    }

    const contestantId = $("kulzzyVoteContestant").value;
    const voterName = $("kulzzyVoterName").value.trim();
    const voterEmail = $("kulzzyVoterEmail").value.trim();

    const votes = Number($("kulzzyVoteCount").value);

    const amountNaira = Number(
        $("kulzzyConfirmedAmount").value
    );

    if (!contestantId || !contestants[contestantId]) {
        status.textContent = "Select a valid contestant.";
        return;
    }

    if (!voterName) {
        status.textContent = "Enter the voter's name.";
        return;
    }

    if (!Number.isSafeInteger(votes) || votes < 1) {
        status.textContent =
            "Enter a whole number of votes greater than zero.";
        return;
    }

    if (!Number.isFinite(amountNaira) || amountNaira < 0) {
        status.textContent =
            "Enter a valid confirmed payment amount.";
        return;
    }

    const contestant = contestants[contestantId];

    const currentVotes = getOfficialVoteCount(contestantId);

    const confirmed = confirm(
        "Confirm that you have independently verified this payment.\n\n" +
        "Contestant: " + contestant.name + "\n" +
        "Voter: " + voterName + "\n" +
        "Payment: ₦" + amountNaira.toLocaleString() + "\n" +
        "Votes to add: " + votes.toLocaleString() + "\n\n" +
        "Continue only if payment has been confirmed."
    );

    if (!confirmed) return;

    button.disabled = true;

    status.textContent = "Saving vote record...";

    try {
        const now = Date.now();

        const recordId = push(
            ref(
                db,
                "faceOfKulzzy/publicVoterRecords/" +
                contestantId
            )
        ).key;

        const updates = {};

        /*
         * PUBLIC DATA
         * Voter name, vote count, date/time.
         * No email or payment amount.
         */

        updates[
            "faceOfKulzzy/publicVoterRecords/" +
            contestantId + "/" + recordId
        ] = {
            voterName: voterName,
            votes: votes,
            createdAt: now,
            approved: true
        };

        /*
         * PRIVATE DATA
         * Administrator-only database path.
         */

        updates[
            "faceOfKulzzy/voterRecordPrivateDetails/" +
            contestantId + "/" + recordId
        ] = {
            voterEmail: voterEmail,
            amountNaira: amountNaira,
            recordedBy: user.email,
            createdAt: now
        };

        /*
         * OFFICIAL VOTE TOTAL
         */

        updates[
            "faceOfKulzzy/officialVotes/" +
            contestantId
        ] = {
            votes: currentVotes + votes,
            updatedAt: now,
            updatedBy: user.email
        };

        await update(ref(db), updates);

        status.textContent =
            "SUCCESS! " +
            votes.toLocaleString() +
            " votes recorded for contestant #" +
            (contestant.number || "") +
            ". New official total: " +
            (currentVotes + votes).toLocaleString() +
            " votes.";

        $("kulzzyVoterName").value = "";
        $("kulzzyVoterEmail").value = "";
        $("kulzzyVoteCount").value = "";
        $("kulzzyConfirmedAmount").value = "";

    } catch (error) {
        console.error("Vote recording failed:", error);

        status.textContent =
            "Could not save votes: " + error.message;

    } finally {
        button.disabled = false;
    }
}


/* ================= CLEAR FORM ================= */

function clearForm() {
    $("editId").value = "";
    $("contestantNo").value = "";
    $("contestantName").value = "";
    $("photoUrl").value = "";
    $("photoFile").value = "";

    $("preview").removeAttribute("src");

    $("formStatus").textContent = "";
}


/* ================= SECURITY ESCAPE ================= */

function escapeHTML(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[character])
    );
}
