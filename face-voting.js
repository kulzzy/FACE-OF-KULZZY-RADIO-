/* =====================================================
   FACE OF KULZZY RADIO 2026
   COMPLETE VOTING APPROVAL SYSTEM
   File: face-voting.js
   ===================================================== */

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
  get,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";


/* =====================================================
   CONFIGURATION
   ===================================================== */

const app = getApp();
const auth = getAuth(app);
const db = getDatabase(app);

const ADMIN_EMAIL = "dstnewz.ng@gmail.com";
const ROOT = "faceOfKulzzy";
const VOTE_UNIT = 100;

const PAYMENT_PAGE = new URL(
  "payment.html",
  window.location.href
).href;


/* =====================================================
   APPLICATION DATA
   ===================================================== */

let contestants = {};
let officialVotes = {};
let pendingRequests = {};

let queueStarted = false;
let approvingRequests = new Set();

let currentPaymentUrl = "";
let paymentRequestSaved = false;


/* =====================================================
   GENERAL HELPERS
   ===================================================== */

const $ = id => document.getElementById(id);


function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}


function money(value) {
  return "₦" + Number(value || 0).toLocaleString("en-NG");
}


function formatDate(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "Date unavailable";
  }

  return new Date(timestamp).toLocaleString("en-NG");
}


/*
  Accept pending requests whose status is explicitly
  "pending", empty, or missing.

  Requests with another status are not approved again.
*/

function isPendingRequest(request) {
  return !!request && (
    request.status === "pending" ||
    request.status === undefined ||
    request.status === ""
  );
}


function setStatus(message, error = false) {
  const element = $("pendingQueueStatus");

  if (!element) return;

  element.textContent = message;

  element.style.color = error
    ? "#ff9999"
    : "#ffd700";
}


/* =====================================================
   ADMIN APPROVAL PANEL
   ===================================================== */

function createQueuePanel() {
  if ($("pendingVotePanel")) return;

  const panel = document.createElement("section");

  panel.id = "pendingVotePanel";
  panel.className = "panel";

  panel.innerHTML = `
    <h2>💳 PENDING PAYMENT APPROVALS</h2>

    <p style="
      color:#c8d3e5;
      line-height:1.7;
      margin-bottom:18px
    ">
      Review each support request and independently verify
      payment before approving votes.

      Every ₦100 equals one vote.
    </p>

    <div
      id="pendingQueueStatus"
      class="status"
      aria-live="polite"
    >
      Loading pending requests...
    </div>

    <div id="pendingRequestList"></div>
  `;

  const adminPanel = $("adminPanel");

  if (adminPanel) {
    adminPanel.prepend(panel);
  }
}


/* =====================================================
   START ADMIN APPROVAL QUEUE
   ===================================================== */

function startQueueWhenReady() {
  if (queueStarted) return;

  const adminPanel = $("adminPanel");

  if (
    !adminPanel ||
    adminPanel.classList.contains("hidden")
  ) {
    return;
  }

  queueStarted = true;

  createQueuePanel();

  listenForContestants();
  listenForOfficialVotes();
  listenForPendingRequests();
}


/* =====================================================
   LOAD CONTESTANTS
   ===================================================== */

function listenForContestants() {
  onValue(
    ref(db, `${ROOT}/contestants`),

    snapshot => {
      contestants = snapshot.val() || {};
      renderPendingRequests();
    },

    error => {
      console.error("Contestant loading error:", error);

      setStatus(
        "Unable to load contestants: " + error.message,
        true
      );
    }
  );
}


/* =====================================================
   LOAD OFFICIAL VOTE TOTALS
   ===================================================== */

function listenForOfficialVotes() {
  onValue(
    ref(db, `${ROOT}/officialVotes`),

    snapshot => {
      officialVotes = snapshot.val() || {};
      renderPendingRequests();
    },

    error => {
      console.error("Official votes loading error:", error);

      setStatus(
        "Unable to load official vote totals.",
        true
      );
    }
  );
}


/* =====================================================
   LOAD PENDING PAYMENT REQUESTS
   ===================================================== */

function listenForPendingRequests() {
  onValue(
    ref(db, `${ROOT}/pendingVoteRequests`),

    snapshot => {
      pendingRequests = snapshot.val() || {};
      renderPendingRequests();
    },

    error => {
      console.error("Pending requests loading error:", error);

      setStatus(
        "Unable to load payment requests. Check Firebase permissions.",
        true
      );
    }
  );
}


/* =====================================================
   DISPLAY PENDING REQUESTS
   ===================================================== */

function renderPendingRequests() {
  const container = $("pendingRequestList");

  if (!container) return;

  const entries = Object.entries(pendingRequests)
    .filter(([, request]) => isPendingRequest(request))
    .sort((a, b) =>
      Number(a[1].createdAt || 0) -
      Number(b[1].createdAt || 0)
    );

  if (!entries.length) {
    container.innerHTML = `
      <div style="
        margin-top:18px;
        padding:20px;
        border:1px solid #29466f;
        border-radius:12px;
        color:#b9c6da;
        line-height:1.7
      ">
        No pending payment requests found.

        <br><br>

        New support requests will appear here automatically
        when they are successfully saved.
      </div>
    `;

    setStatus("Pending requests: 0");

    return;
  }

  setStatus("Pending requests: " + entries.length);

  container.innerHTML = entries.map(
    ([requestId, request]) => {
      const contestant = contestants[request.contestantId];

      const requestedAmount =
        Number(request.requestedAmount || 0);

      const requestedVotes =
        Number(
          request.requestedVotes ||
          (
            requestedAmount >= VOTE_UNIT
              ? requestedAmount / VOTE_UNIT
              : 0
          )
        );

      const contestantName =
        request.contestantName ||
        contestant?.name ||
        "Unknown contestant";

      const contestantNumber =
        request.contestantNumber ||
        contestant?.number ||
        "";

      const isApproving =
        approvingRequests.has(requestId);

      return `
        <article style="
          margin-top:18px;
          padding:18px;
          border:1px solid rgba(255,215,0,.35);
          border-radius:14px;
          background:#06122a;
          overflow-wrap:anywhere
        ">

          <h3 style="
            color:#ffd700;
            margin:0 0 14px
          ">
            ${escapeHTML(contestantName)}
          </h3>

          <div style="
            line-height:1.9;
            color:#dce5f5;
            font-size:14px
          ">

            <div>
              <strong>Contestant number:</strong>
              ${escapeHTML(contestantNumber || "Not provided")}
            </div>

            <div>
              <strong>Supporter:</strong>
              ${escapeHTML(request.voterName || "Not provided")}
            </div>

            <div>
              <strong>Supporter email:</strong>
              ${escapeHTML(request.voterEmail || "Not provided")}
            </div>

            <div>
              <strong>Requested payment:</strong>
              ${money(requestedAmount)}
            </div>

            <div>
              <strong>Requested votes:</strong>
              ${requestedVotes.toLocaleString()}
            </div>

            <div>
              <strong>Submitted:</strong>
              ${escapeHTML(formatDate(request.createdAt))}
            </div>

            <div>
              <strong>Request ID:</strong>
              ${escapeHTML(requestId)}
            </div>

          </div>

          <hr style="
            border:0;
            border-top:1px solid #29466f;
            margin:18px 0
          ">

          <label
            for="confirmedAmount-${escapeHTML(requestId)}"
            style="
              display:block;
              color:#ffd700;
              font-weight:bold;
              margin-bottom:9px
            "
          >
            Amount actually received (₦)
          </label>

          <input
            data-confirmed-amount="${escapeHTML(requestId)}"
            id="confirmedAmount-${escapeHTML(requestId)}"
            type="number"
            min="100"
            step="100"
            inputmode="numeric"
            value="${requestedAmount >= 100 ? requestedAmount : ""}"
            placeholder="Enter confirmed amount"
            style="
              width:100%;
              padding:13px;
              border-radius:10px;
              border:1px solid #29466f;
              background:#0b1d3d;
              color:white;
              font-size:16px;
            "
            ${isApproving ? "disabled" : ""}
          >

          <div
            data-calculated-votes="${escapeHTML(requestId)}"
            style="
              margin-top:10px;
              color:#ffd700;
              font-weight:bold
            "
          >
            ${
              requestedAmount >= VOTE_UNIT &&
              requestedAmount % VOTE_UNIT === 0
                ? requestedVotes.toLocaleString() +
                  " votes if this amount is verified"
                : "Enter the amount actually received"
            }
          </div>

          <button
            type="button"
            class="primary"
            data-approve-request="${escapeHTML(requestId)}"
            style="
              width:100%;
              margin-top:16px;
              line-height:1.5
            "
            ${isApproving ? "disabled" : ""}
          >
            ${
              isApproving
                ? "PROCESSING..."
                : "VERIFY PAYMENT & APPROVE VOTES"
            }
          </button>

        </article>
      `;
    }
  ).join("");


  /* Update vote preview */

  container.querySelectorAll(
    "[data-confirmed-amount]"
  ).forEach(input => {
    input.addEventListener("input", () => {
      const requestId = input.dataset.confirmedAmount;
      const amount = Number(input.value);

      const preview = container.querySelector(
        `[data-calculated-votes="${requestId}"]`
      );

      if (!preview) return;

      if (
        Number.isSafeInteger(amount) &&
        amount >= VOTE_UNIT &&
        amount % VOTE_UNIT === 0
      ) {
        preview.textContent =
          (amount / VOTE_UNIT).toLocaleString() +
          " votes if this amount is verified";
      } else {
        preview.textContent =
          "Enter a valid amount in multiples of ₦100";
      }
    });
  });


  /* Approve selected request */

  container.querySelectorAll(
    "[data-approve-request]"
  ).forEach(button => {
    button.addEventListener("click", () => {
      approvePendingRequest(
        button.dataset.approveRequest
      );
    });
  });
}


/* =====================================================
   VERIFY PAYMENT AND APPROVE VOTES
   ===================================================== */

async function approvePendingRequest(requestId) {
  if (approvingRequests.has(requestId)) return;

  const user = auth.currentUser;

  if (
    !user ||
    user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
  ) {
    setStatus(
      "Access denied. Log in with the authorized admin account.",
      true
    );

    return;
  }

  const request = pendingRequests[requestId];

  if (!isPendingRequest(request)) {
    setStatus(
      "This request is not pending or could not be found. Refresh the page.",
      true
    );

    return;
  }

  const contestantId = request.contestantId;
  const contestant = contestants[contestantId];

  if (!contestant || !contestantId) {
    setStatus(
      "The contestant linked to this request could not be found.",
      true
    );

    return;
  }

  const amountInput = document.querySelector(
    `[data-confirmed-amount="${requestId}"]`
  );

  if (!amountInput) {
    setStatus(
      "The confirmed payment amount field could not be found.",
      true
    );

    return;
  }

  const amount = Number(amountInput.value);

  if (
    !Number.isSafeInteger(amount) ||
    amount < VOTE_UNIT ||
    amount % VOTE_UNIT !== 0
  ) {
    setStatus(
      "Enter the actual amount received in multiples of ₦100.",
      true
    );

    amountInput.focus();

    return;
  }

  const requestedAmount =
    Number(request.requestedAmount || 0);

  if (
    requestedAmount > 0 &&
    amount > requestedAmount
  ) {
    setStatus(
      "The confirmed amount exceeds the requested amount. Check the payment before proceeding.",
      true
    );

    return;
  }

  if (!confirm(
    "CONFIRM PAYMENT APPROVAL\n\n" +
    "Contestant: " + (contestant.name || "") + "\n" +
    "Contestant number: " + (contestant.number || "") + "\n" +
    "Supporter: " + (request.voterName || "") + "\n" +
    "Payment received: " + money(amount) + "\n" +
    "Votes to approve: " + (amount / VOTE_UNIT).toLocaleString() + "\n\n" +
    "Have you independently confirmed that this payment was received?"
  )) {
    return;
  }

  approvingRequests.add(requestId);
  renderPendingRequests();

  let finalApprovalStatus = null;

  setStatus("Saving approved votes to Firebase...");

  try {
    /*
      Read the latest official vote total.
    */

    const officialSnapshot = await get(
      ref(db, `${ROOT}/officialVotes/${contestantId}`)
    );

    const officialData = officialSnapshot.val() || {};

    /*
      Recheck the request before changing any totals.
    */

    const requestSnapshot = await get(
      ref(db, `${ROOT}/pendingVoteRequests/${requestId}`)
    );

    const latestRequest = requestSnapshot.val();

    if (!isPendingRequest(latestRequest)) {
      throw new Error(
        "This request has already changed status. Refresh the page before continuing."
      );
    }

    const currentVotes = Number(
      officialData.votes ??
      contestant.votes ??
      0
    );

    const currentMoney = Number(
      contestant.money || 0
    );

    if (
      !Number.isSafeInteger(currentVotes) ||
      currentVotes < 0 ||
      !Number.isSafeInteger(currentMoney) ||
      currentMoney < 0
    ) {
      throw new Error(
        "The existing contestant totals are invalid."
      );
    }

    const votes = amount / VOTE_UNIT;
    const newTotal = currentVotes + votes;
    const newMoney = currentMoney + amount;
    const now = Date.now();

    const changes = {};

    changes[
      `${ROOT}/contestants/${contestantId}/votes`
    ] = newTotal;

    changes[
      `${ROOT}/contestants/${contestantId}/money`
    ] = newMoney;

    changes[
      `${ROOT}/officialVotes/${contestantId}`
    ] = {
      votes: newTotal,
      updatedAt: now
    };

    changes[
      `${ROOT}/pendingVoteRequests/${requestId}/status`
    ] = "approved";

    changes[
      `${ROOT}/pendingVoteRequests/${requestId}/confirmedAmount`
    ] = amount;

    changes[
      `${ROOT}/pendingVoteRequests/${requestId}/approvedVotes`
    ] = votes;

    changes[
      `${ROOT}/pendingVoteRequests/${requestId}/approvedAt`
    ] = now;

    changes[
      `${ROOT}/pendingVoteRequests/${requestId}/approvedBy`
    ] = user.email;

    /*
      Save the changes together.
      Firebase must permit writes to every listed path.
    */

    await update(ref(db), changes);

    finalApprovalStatus = {
      message:
        "SUCCESS! " +
        votes.toLocaleString() +
        " votes approved for " +
        (contestant.name || "the contestant") +
        ". New official total: " +
        newTotal.toLocaleString() +
        ".",
      error: false
    };

  } catch (error) {
    console.error(
      "FACE OF KULZZY VOTE APPROVAL FAILED:",
      error
    );

    finalApprovalStatus = {
      message:
        "APPROVAL FAILED: " +
        (error?.message || String(error)) +
        ". Check Firebase permissions. Do not assume the votes were approved.",
      error: true
    };

  } finally {
    approvingRequests.delete(requestId);

    renderPendingRequests();

    /*
      IMPORTANT FIX:
      Rendering the queue resets its status text.
      Restore the real approval result after rendering.
    */

    if (finalApprovalStatus) {
      setStatus(
        finalApprovalStatus.message,
        finalApprovalStatus.error
      );
    }
  }
}


/* =====================================================
   PUBLIC VOTING MODAL — PAYMENT LINK
   ===================================================== */

function setupPaymentLinkArea() {
  const message = $("voteMessage");

  if (!message || $("generatedPaymentLink")) return;

  const linkArea = document.createElement("div");

  linkArea.id = "generatedPaymentLink";

  linkArea.style.cssText = `
    display:none;
    margin-top:16px;
    padding:14px;
    border:1px solid rgba(255,215,0,.4);
    border-radius:12px;
    background:#06122a;
    color:#ffffff;
    overflow-wrap:anywhere;
    line-height:1.7;
  `;

  linkArea.innerHTML = `
    <strong style="color:#ffd700">
      YOUR PAYMENT LINK
    </strong>

    <div
      id="generatedPaymentUrl"
      style="margin-top:8px;overflow-wrap:anywhere"
    ></div>

    <button
      id="openGeneratedPayment"
      type="button"
      style="
        width:100%;
        margin-top:12px;
        padding:14px;
        border:0;
        border-radius:10px;
        background:#ffd700;
        color:#06122a;
        font-weight:900;
      "
    >
      OPEN PAYMENT PAGE
    </button>

    <button
      id="copyGeneratedPayment"
      type="button"
      style="
        width:100%;
        margin-top:8px;
        padding:12px;
        border:1px solid #35517b;
        border-radius:10px;
        background:#14294b;
        color:white;
        font-weight:bold;
      "
    >
      COPY PAYMENT LINK
    </button>

    <p style="
      margin-top:10px;
      color:#c8d3e5;
      font-size:12px
    ">
      Keep this link with your request details.
      Payment must be verified before votes are approved.
    </p>
  `;

  message.insertAdjacentElement("afterend", linkArea);

  $("openGeneratedPayment").addEventListener("click", () => {
    if (!currentPaymentUrl) return;

    window.location.assign(currentPaymentUrl);
  });

  $("copyGeneratedPayment").addEventListener("click", async () => {
    if (!currentPaymentUrl) return;

    try {
      await navigator.clipboard.writeText(currentPaymentUrl);

      $("copyGeneratedPayment").textContent = "LINK COPIED";

    } catch (error) {
      const temporaryInput = document.createElement("textarea");

      temporaryInput.value = currentPaymentUrl;
      temporaryInput.style.position = "fixed";
      temporaryInput.style.opacity = "0";

      document.body.appendChild(temporaryInput);

      temporaryInput.select();

      const copied = document.execCommand("copy");

      temporaryInput.remove();

      $("copyGeneratedPayment").textContent =
        copied ? "LINK COPIED" : "COPY FAILED — SELECT THE LINK ABOVE";
    }
  });
}


function displayGeneratedPaymentLink(url) {
  currentPaymentUrl = url;

  setupPaymentLinkArea();

  const area = $("generatedPaymentLink");
  const urlElement = $("generatedPaymentUrl");

  if (!area || !urlElement) return;

  area.style.display = "block";

  urlElement.replaceChildren();

  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.textContent = url;

  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";

  anchor.style.color = "#ffd700";
  anchor.style.overflowWrap = "anywhere";

  urlElement.appendChild(anchor);

  const button = $("openGeneratedPayment");

  if (button) {
    button.textContent = "OPEN PAYMENT PAGE";
  }
}


/* =====================================================
   RESET PAYMENT LINK WHEN OPENING A NEW REQUEST
   ===================================================== */

function resetPaymentLink() {
  currentPaymentUrl = "";
  paymentRequestSaved = false;

  setupPaymentLinkArea();

  const area = $("generatedPaymentLink");

  if (area) {
    area.style.display = "none";
  }

  const copyButton = $("copyGeneratedPayment");

  if (copyButton) {
    copyButton.textContent = "COPY PAYMENT LINK";
  }
}


/* =====================================================
   PUBLIC PAGE PAYMENT REQUEST HANDLER
   ===================================================== */

/*
  The existing index.html calls its own startPayment()
  function. This file does not replace that function.

  The public page already creates a request ID and sends
  supporters to payment.html with that ID in the URL.

  The code above preserves the existing voting page flow
  and provides the payment-link display functions.
*/


/* =====================================================
   ADMIN LOGIN STATE
   ===================================================== */

onAuthStateChanged(auth, user => {
  if (
    !user ||
    user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
  ) {
    $("pendingVotePanel")?.remove();

    queueStarted = false;

    return;
  }

  /*
    face-admin.js controls the visibility of adminPanel.
    Wait for that existing login handler to show it.
  */

  let attempts = 0;

  const wait = setInterval(() => {
    attempts++;

    const adminPanel = $("adminPanel");

    if (
      adminPanel &&
      !adminPanel.classList.contains("hidden")
    ) {
      clearInterval(wait);

      startQueueWhenReady();

      return;
    }

    if (attempts >= 100) {
      clearInterval(wait);

      console.warn(
        "Admin panel did not become visible. Log in again."
      );
    }
  }, 200);
});


/* =====================================================
   INITIALIZE PAYMENT LINK SUPPORT
   ===================================================== */

if ($("voteMessage")) {
  setupPaymentLinkArea();
}
