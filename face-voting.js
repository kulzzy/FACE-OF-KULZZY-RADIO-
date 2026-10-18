import {
  getApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getDatabase,
  ref,
  onValue,
  push,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = getApp();
const auth = getAuth(app);
const db = getDatabase(app);

const ADMIN_EMAIL = "dstnewz.ng@gmail.com";
const ROOT = "faceOfKulzzy";

let contestants = {};
let officialVotes = {};
let selectedId = "";
let submitting = false;

const $ = id => document.getElementById(id);

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function showMessage(message, error = false) {
  const element = $("voteAdminStatus");
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? "#ff9999" : "#ffd700";
}

function createPanel() {
  if ($("manualVotePanel")) return;

  const panel = document.createElement("section");
  panel.id = "manualVotePanel";
  panel.className = "panel";

  panel.innerHTML = `
    <h2>🗳️ MANUAL VOTE APPROVAL</h2>

    <p style="color:#c8d3e5;line-height:1.6;margin-bottom:16px">
      Only approve votes after independently confirming payment.
      ₦100 = 1 vote. Payment is not verified automatically.
    </p>

    <label for="voteContestant">Select contestant</label>
    <select id="voteContestant"
      style="width:100%;padding:14px;border-radius:10px;
      background:#06122a;color:white;border:1px solid #29466f">
    </select>

    <br><br>

    <label for="voteVoterName">Voter's public name</label>
    <input id="voteVoterName" type="text"
      placeholder="Name to display publicly">

    <br><br>

    <label for="voteVoterEmail">Voter's private email</label>
    <input id="voteVoterEmail" type="email"
      placeholder="Private email address">

    <br><br>

    <label for="votePaymentAmount">Confirmed payment amount (₦)</label>
    <input id="votePaymentAmount" type="number"
      min="100" step="100" inputmode="numeric"
      placeholder="e.g. 1000">

    <br><br>

    <label for="voteQuantity">Votes to approve</label>
    <input id="voteQuantity" type="number"
      min="1" step="1" inputmode="numeric"
      placeholder="Number of votes">

    <br><br>

    <label for="votePaymentReference">
      Payment reference (optional)
    </label>
    <input id="votePaymentReference" type="text"
      placeholder="Transaction reference">

    <br><br>

    <label style="display:flex;gap:10px;align-items:flex-start">
      <input id="votePaymentConfirmed" type="checkbox"
        style="width:20px;height:20px;flex-shrink:0">
      I have independently confirmed that this payment was received.
    </label>

    <div class="actions">
      <button id="approveVotesBtn" class="primary" type="button">
        APPROVE AND RECORD VOTES
      </button>
      <button id="shareVoteLinkBtn" class="secondary" type="button">
        GET CONTESTANT SHARE LINK
      </button>
    </div>

    <div id="voteAdminStatus" class="status" aria-live="polite"></div>

    <div id="voteShareLinkBox"
      style="display:none;margin-top:12px;overflow-wrap:anywhere">
      <label>Contestant voter-record link</label>
      <input id="voteShareLink" type="text" readonly>
      <button id="copyVoteLinkBtn" class="secondary"
        type="button" style="margin-top:10px">
        COPY LINK
      </button>
    </div>
  `;

  $("adminPanel").prepend(panel);

  $("voteContestant").addEventListener("change", event => {
    selectedId = event.target.value;
    showMessage("");
  });

  $("votePaymentAmount").addEventListener("input", () => {
    const amount = Number($("votePaymentAmount").value);

    if (Number.isSafeInteger(amount) && amount >= 100 && amount % 100 === 0) {
      $("voteQuantity").value = amount / 100;
    } else {
      $("voteQuantity").value = "";
    }
  });

  $("voteQuantity").addEventListener("input", () => {
    const votes = Number($("voteQuantity").value);

    if (Number.isSafeInteger(votes) && votes >= 1) {
      $("votePaymentAmount").value = votes * 100;
    }
  });

  $("approveVotesBtn").addEventListener("click", approveVotes);
  $("shareVoteLinkBtn").addEventListener("click", createShareLink);
  $("copyVoteLinkBtn").addEventListener("click", copyShareLink);
}

function loadVoteContestants() {
  onValue(
    ref(db, `${ROOT}/contestants`),
    snapshot => {
      contestants = snapshot.val() || {};
      renderVoteContestants();
    },
    error => {
      console.error(error);
      showMessage("Unable to load contestants: " + error.message, true);
    }
  );

  onValue(
    ref(db, `${ROOT}/officialVotes`),
    snapshot => {
      officialVotes = snapshot.val() || {};
    },
    error => {
      console.error(error);
      showMessage("Unable to load official vote totals.", true);
    }
  );
}

function renderVoteContestants() {
  const select = $("voteContestant");
  if (!select) return;

  const previous = selectedId || select.value;

  const list = Object.entries(contestants)
    .filter(([, contestant]) => contestant && contestant.active !== false)
    .sort((a, b) =>
      String(a[1].number || "").localeCompare(
        String(b[1].number || ""),
        undefined,
        { numeric: true }
      )
    );

  select.innerHTML = '<option value="">Choose a contestant</option>';

  list.forEach(([id, contestant]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent =
      `#${contestant.number || ""} — ${contestant.name || "Contestant"}`;
    select.appendChild(option);
  });

  if (list.some(([id]) => id === previous)) {
    select.value = previous;
    selectedId = previous;
  } else {
    selectedId = "";
  }
}

async function approveVotes() {
  if (submitting) return;

  const user = auth.currentUser;

  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
    showMessage("Administrator login required.", true);
    return;
  }

  const contestantId = $("voteContestant").value;
  const contestant = contestants[contestantId];
  const voterName = $("voteVoterName").value.trim();
  const voterEmail = $("voteVoterEmail").value.trim();
  const amount = Number($("votePaymentAmount").value);
  const votes = Number($("voteQuantity").value);
  const paymentReference = $("votePaymentReference").value.trim();
  const confirmed = $("votePaymentConfirmed").checked;

  if (!contestant || !contestantId) {
    showMessage("Select a contestant.", true);
    return;
  }

  if (!voterName) {
    showMessage("Enter the voter's name.", true);
    return;
  }

  if (!voterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(voterEmail)) {
    showMessage("Enter a valid private email address.", true);
    return;
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount < 100 ||
    amount % 100 !== 0
  ) {
    showMessage("Payment amount must be at least ₦100 in multiples of ₦100.", true);
    return;
  }

  if (
    !Number.isSafeInteger(votes) ||
    votes < 1 ||
    votes * 100 !== amount
  ) {
    showMessage("Vote quantity must match the payment amount.", true);
    return;
  }

  if (!confirmed) {
    showMessage("Confirm that you have received the payment first.", true);
    return;
  }

  const currentOfficial = Number(
    officialVotes[contestantId]?.votes ??
    contestant.votes ??
    0
  );

  if (
    !Number.isSafeInteger(currentOfficial) ||
    currentOfficial < 0 ||
    !Number.isSafeInteger(currentOfficial + votes)
  ) {
    showMessage("The existing vote total is invalid.", true);
    return;
  }

  const newTotal = currentOfficial + votes;
  const now = Date.now();
  const recordId = push(ref(db, `${ROOT}/publicVoterRecords/${contestantId}`)).key;

  if (!recordId) {
    showMessage("Unable to create the voter record.", true);
    return;
  }

  const publicRecord = {
    voterName,
    votes,
    createdAt: now,
    approved: true
  };

  const privateRecord = {
    voterName,
    voterEmail,
    paymentAmount: amount,
    paymentReference,
    votes,
    contestantId,
    createdAt: now,
    approvedBy: user.email,
    approved: true
  };

  const changes = {};

  changes[`${ROOT}/contestants/${contestantId}/votes`] = newTotal;
  changes[`${ROOT}/officialVotes/${contestantId}`] = {
    votes: newTotal,
    updatedAt: now
  };

  changes[`${ROOT}/publicVoterRecords/${contestantId}/${recordId}`] =
    publicRecord;

  changes[`${ROOT}/voterRecordPrivateDetails/${contestantId}/${recordId}`] =
    privateRecord;

  submitting = true;
  $("approveVotesBtn").disabled = true;
  showMessage("Recording approved votes...");

  try {
    await update(ref(db), changes);

    showMessage(
      `SUCCESS: ${votes.toLocaleString()} votes approved for ` +
      `${contestant.name}. New official total: ${newTotal.toLocaleString()}.`
    );

    $("voteVoterName").value = "";
    $("voteVoterEmail").value = "";
    $("votePaymentAmount").value = "";
    $("voteQuantity").value = "";
    $("votePaymentReference").value = "";
    $("votePaymentConfirmed").checked = false;

  } catch (error) {
    console.error(error);
    showMessage(
      "Could not record votes: " + error.message +
      ". Check your Firebase database rules.",
      true
    );
  } finally {
    submitting = false;
    $("approveVotesBtn").disabled = false;
  }
}

function createShareLink() {
  const contestantId = $("voteContestant").value;

  if (!contestantId) {
    showMessage("Select a contestant first.", true);
    return;
  }

  const link = new URL("contestant-voters.html", window.location.href);
  link.searchParams.set("id", contestantId);

  $("voteShareLink").value = link.href;
  $("voteShareLinkBox").style.display = "block";
  showMessage("Contestant voter-record link created.");
}

async function copyShareLink() {
  const input = $("voteShareLink");

  if (!input.value) return;

  try {
    await navigator.clipboard.writeText(input.value);
    showMessage("Share link copied.");
  } catch {
    input.focus();
    input.select();
    showMessage("Select the link above and copy it manually.");
  }
}

onAuthStateChanged(auth, user => {
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
    $("manualVotePanel")?.remove();
    return;
  }

  if (!$("adminPanel") || $("adminPanel").classList.contains("hidden")) {
    return;
  }

  createPanel();
  loadVoteContestants();
});
