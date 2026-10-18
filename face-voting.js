/* =====================================================
   FACE OF KULZZY RADIO 2026
   PENDING PAYMENT QUEUE & VOTE APPROVAL
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


/* =====================================================
   DATA
   ===================================================== */

let contestants = {};
let officialVotes = {};
let pendingRequests = {};

let queueStarted = false;
let approvingRequests = new Set();


/* =====================================================
   HELPERS
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


function setStatus(message, error = false) {
  const element = $("pendingQueueStatus");

  if (!element) return;

  element.textContent = message;

  element.style.color = error
    ? "#ff9999"
    : "#ffd700";
}


/* =====================================================
   CREATE ADMIN QUEUE
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
      Review supporter requests below. Independently verify
      the payment in your payment account before approving.
      Only the amount actually received should be approved.
      Every ₦100 equals one vote.
    </p>

    <div id="pendingQueueStatus"
      class="status"
      aria-live="polite">
      Loading pending requests...
    </div>

    <div id="pendingRequestList"></div>
  `;

  $("adminPanel").prepend(panel);
}


/* =====================================================
   WAIT FOR EXISTING ADMIN PANEL
   ===================================================== */

function startQueueWhenReady() {
  if (queueStarted) return;

  const adminPanel = $("adminPanel");

  if (!adminPanel || adminPanel.classList.contains("hidden")) {
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
   LOAD OFFICIAL VOTES
   ===================================================== */

function listenForOfficialVotes() {
  onValue(
    ref(db, `${ROOT}/officialVotes`),

    snapshot => {
      officialVotes = snapshot.val() || {};
      renderPendingRequests();
    },

    error => {
      console.error("Official vote loading error:", error);

      setStatus(
        "Unable to load official vote totals.",
        true
      );
    }
  );
}


/* =====================================================
   LOAD PENDING REQUESTS
   ===================================================== */

function listenForPendingRequests() {
  onValue(
    ref(db, `${ROOT}/pendingVoteRequests`),

    snapshot => {
      pendingRequests = snapshot.val() || {};
      renderPendingRequests();
    },

    error => {
      console.error("Pending request loading error:", error);

      setStatus(
        "Unable to load requests. Check Firebase database permissions.",
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
    .filter(([, request]) =>
      request &&
      (
        request.status === "pending" ||
        request.status === undefined ||
        request.status === ""
      )
    )
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
        No pending requests found.

        <br><br>

        When the public page successfully saves a support
        request, it will appear here automatically.
      </div>
    `;

    setStatus("Pending requests: 0");

    return;
  }

  setStatus(
    "Pending requests: " + entries.length
  );

  container.innerHTML = entries.map(
    ([requestId, request]) => {
      const contestant =
        contestants[request.contestantId];

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
            ${isApproving ? "disabled" : ""}
          >

          <div style="
            margin-top:10px;
            color:#ffd700;
            font-weight:bold
          "
          data-calculated-votes="${escapeHTML(requestId)}">
            ${requestedAmount >= 100 &&
              requestedAmount % VOTE_UNIT === 0
              ? requestedVotes.toLocaleString() +
                " votes if this amount is verified"
              : "Enter the amount actually received"}
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
            ${isApproving
              ? "PROCESSING..."
              : "VERIFY PAYMENT & APPROVE VOTES"}
          </button>

        </article>
      `;
    }
  ).join("");


  /* Update vote preview when amount changes */

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
   VERIFY AND APPROVE REQUEST
   ===================================================== */

async function approvePendingRequest(requestId) {
  if (approvingRequests.has(requestId)) return;

  const user = auth.currentUser;

  if (
    !user ||
    user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
  ) {
    setStatus(
      "The authorized administrator must be logged in.",
      true
    );

    return;
  }

  const request = pendingRequests[requestId];

  if (!request) {
    setStatus(
      "This request no longer exists. Refresh the page.",
      true
    );

    return;
  }

  if (request.status !== "pending") {
    setStatus(
      "This request is not pending and cannot be approved again.",
      true
    );

    return;
  }

  const contestantId = request.contestantId;
  const contestant = contestants[contestantId];

  if (!contestant || !contestantId) {
    setStatus(
      "The contestant for this request could not be found.",
      true
    );

    return;
  }

  const amountInput = document.querySelector(
    `[data-confirmed-amount="${requestId}"]`
  );

  const amount = Number(amountInput?.value);

  if (
    !Number.isSafeInteger(amount) ||
    amount < VOTE_UNIT ||
    amount % VOTE_UNIT !== 0
  ) {
    setStatus(
      "Enter the actual amount received, in multiples of ₦100.",
      true
    );

    amountInput?.focus();

    return;
  }

  const votes = amount / VOTE_UNIT;

  if (!Number.isSafeInteger(votes) || votes < 1) {
    setStatus("The calculated vote quantity is invalid.", true);
    return;
  }

  const requestedAmount =
    Number(request.requestedAmount || 0);

  if (
    requestedAmount > 0 &&
    amount > requestedAmount
  ) {
    setStatus(
      "The confirmed amount cannot exceed the requested amount. " +
      "Check the request before proceeding.",
      true
    );

    return;
  }

  const confirmed = confirm(
    "Have you independently verified that this payment " +
    "was actually received?\n\n" +
    "Contestant: " + (contestant.name || "") + "\n" +
    "Supporter: " + (request.voterName || "") + "\n" +
    "Confirmed amount: " + money(amount) + "\n" +
    "Votes to approve: " + votes.toLocaleString() + "\n\n" +
    "Only continue if payment has been verified."
  );

  if (!confirmed) return;

  const officialEntry = officialVotes[contestantId];

  const currentTotal = Number(
    officialEntry?.votes ??
    contestant.votes ??
    0
  );

  if (
    !Number.isSafeInteger(currentTotal) ||
    currentTotal < 0 ||
    !Number.isSafeInteger(currentTotal + votes)
  ) {
    setStatus(
      "The existing official vote total is invalid.",
      true
    );

    return;
  }

  const newTotal = currentTotal + votes;
  const now = Date.now();

  /*
    Create a unique record ID.
    The request ID itself identifies the approval operation.
  */

  const recordId = requestId;

  const publicRecord = {
    voterName: request.voterName || "Supporter",
    votes: votes,
    paymentAmount: amount,
    createdAt: now,
    approved: true
  };

  const privateRecord = {
    requestId: requestId,
    contestantId: contestantId,
    voterName: request.voterName || "",
    voterEmail: request.voterEmail || "",
    paymentAmount: amount,
    requestedAmount: requestedAmount,
    votes: votes,
    approved: true,
    approvedAt: now,
    approvedBy: user.email
  };

  /*
    Keep the official totals and request status in one
    Firebase multi-location update.
  */

  const changes = {};

  changes[
    `${ROOT}/contestants/${contestantId}/votes`
  ] = newTotal;

  changes[
    `${ROOT}/contestants/${contestantId}/money`
  ] = Number(contestant.money || 0) + amount;

  changes[
    `${ROOT}/officialVotes/${contestantId}`
  ] = {
    votes: newTotal,
    updatedAt: now
  };

  changes[
    `${ROOT}/publicVoterRecords/${contestantId}/${recordId}`
  ] = publicRecord;

  changes[
    `${ROOT}/voterRecordPrivateDetails/${contestantId}/${recordId}`
  ] = privateRecord;

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

  changes[
    `${ROOT}/pendingVoteRequests/${requestId}/publicRecordId`
  ] = recordId;


  approvingRequests.add(requestId);
  renderPendingRequests();

  setStatus("Saving the approved vote record...");

  try {
    await update(ref(db), changes);

    /*
      The realtime listener will remove the approved request
      from the pending list.
    */

    setStatus(
      "SUCCESS: " +
      votes.toLocaleString() +
      " votes approved for " +
      (contestant.name || "the contestant") +
      ". New official total: " +
      newTotal.toLocaleString() + "."
    );

  } catch (error) {
    console.error("Vote approval error:", error);

    setStatus(
      "Could not save the approval: " +
      error.message +
      ". No success should be assumed; check Firebase.",
      true
    );

  } finally {
    approvingRequests.delete(requestId);
    renderPendingRequests();
  }
}


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
    The existing face-admin.js controls visibility of adminPanel.
    Wait briefly for its login handler to reveal that panel.
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

    if (attempts >= 50) {
      clearInterval(wait);

      console.warn(
        "Admin panel did not become visible. " +
        "Please log in again."
      );
    }
  }, 100);
});
