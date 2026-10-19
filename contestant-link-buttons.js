/* =====================================================
   FACE OF KULZZY RADIO 2026
   CONTESTANT TRACKING LINK BUTTONS
   File: contestant-link-buttons.js

   Uses the existing contestant-voters.html page.
   Does not modify payment approval logic.
   ===================================================== */

import {
    initializeApp,
    getApps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* =====================================================
   1. FIREBASE CONFIGURATION
   ===================================================== */

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


/* =====================================================
   2. ADMIN CONFIGURATION
   ===================================================== */

const ADMIN_EMAIL = "dstnewz.ng@gmail.com";


/* =====================================================
   3. INITIALIZE FIREBASE WITHOUT REPLACING THE
      EXISTING ADMIN APP
   ===================================================== */

let app = getApps().find(
    existingApp =>
        existingApp.name === "KulzzyTrackingLinks"
);

if (!app) {
    app = initializeApp(
        firebaseConfig,
        "KulzzyTrackingLinks"
    );
}

const auth = getAuth(app);


/* =====================================================
   4. PAGE ELEMENTS
   ===================================================== */

const contestantRows =
    document.getElementById("contestantRows");

const listStatus =
    document.getElementById("listStatus");


/* =====================================================
   5. ADMIN AUTHORIZATION
   ===================================================== */

let authorizedAdmin = false;

function showMessage(message) {
    if (listStatus) {
        listStatus.textContent = message;
    }
}

onAuthStateChanged(auth, user => {
    authorizedAdmin = Boolean(
        user &&
        user.email &&
        user.email.toLowerCase() ===
            ADMIN_EMAIL.toLowerCase()
    );

    if (!authorizedAdmin) {
        removeTrackingButtons();
        return;
    }

    addTrackingButtons();
});


/* =====================================================
   6. REMOVE TRACKING BUTTONS WHEN ADMIN LOGS OUT
   ===================================================== */

function removeTrackingButtons() {
    document
        .querySelectorAll(".contestant-tracking-button")
        .forEach(button => button.remove());
}


/* =====================================================
   7. BUILD A CONTESTANT'S TRACKING LINK
   ===================================================== */

function buildTrackingLink(contestantId) {
    const page = new URL(
        "contestant-voters.html",
        window.location.href
    );

    page.searchParams.set("id", contestantId);

    return page.href;
}


/* =====================================================
   8. COPY TRACKING LINK
   ===================================================== */

async function copyTrackingLink(
    contestantId,
    button
) {
    if (!authorizedAdmin) {
        showMessage(
            "Please log in with the authorized admin account."
        );

        return;
    }

    if (!contestantId) {
        showMessage(
            "Unable to identify this contestant."
        );

        return;
    }

    const link = buildTrackingLink(contestantId);

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "PREPARING LINK...";

    try {
        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {
            await navigator.clipboard.writeText(link);

            button.textContent = "LINK COPIED!";

            showMessage(
                "Contestant tracking link copied. You can now send it to the contestant."
            );

        } else {
            showCopyPrompt(link);

            button.textContent = "LINK READY";

            showMessage(
                "The tracking link is displayed. Copy it and send it to the contestant."
            );
        }

    } catch (error) {
        console.error(
            "Tracking link copy error:",
            error
        );

        showCopyPrompt(link);

        button.textContent = "LINK READY";

        showMessage(
            "Copy the displayed link and send it to the contestant."
        );

    } finally {
        button.disabled = false;

        setTimeout(() => {
            if (button.isConnected) {
                button.textContent = originalText;
            }
        }, 2500);
    }
}


/* =====================================================
   9. FALLBACK FOR MOBILE BROWSERS
   ===================================================== */

function showCopyPrompt(link) {
    window.prompt(
        "Copy this contestant tracking link:",
        link
    );
}


/* =====================================================
   10. ADD TRACKING BUTTONS TO EACH CONTESTANT
   ===================================================== */

function addTrackingButtons() {
    if (!authorizedAdmin || !contestantRows) {
        return;
    }

    const rows = contestantRows.querySelectorAll("tr");

    rows.forEach(row => {
        const actionsCell = row.lastElementChild;

        if (!actionsCell) {
            return;
        }

        /*
         * The existing EDIT button stores the
         * Firebase contestant ID in data-edit.
         */

        const editButton =
            actionsCell.querySelector("[data-edit]");

        if (!editButton) {
            return;
        }

        const contestantId =
            editButton.dataset.edit;

        if (!contestantId) {
            return;
        }

        /*
         * Do not add duplicate buttons when the
         * contestant list refreshes.
         */

        let trackingButton =
            actionsCell.querySelector(
                ".contestant-tracking-button"
            );

        if (!trackingButton) {
            trackingButton =
                document.createElement("button");

            trackingButton.type = "button";

            trackingButton.className =
                "primary contestant-tracking-button";

            trackingButton.textContent =
                "COPY TRACKING LINK";

            trackingButton.style.marginTop = "6px";
            trackingButton.style.display = "block";
            trackingButton.style.width = "100%";
            trackingButton.style.whiteSpace = "normal";
            trackingButton.style.overflowWrap = "anywhere";

            actionsCell.appendChild(trackingButton);
        }

        /*
         * Replace the previous handler safely.
         */

        trackingButton.onclick = () => {
            copyTrackingLink(
                contestantId,
                trackingButton
            );
        };
    });
}


/* =====================================================
   11. WATCH FOR CONTESTANT LIST UPDATES
   ===================================================== */

if (contestantRows) {
    const observer = new MutationObserver(() => {
        addTrackingButtons();
    });

    observer.observe(
        contestantRows,
        {
            childList: true,
            subtree: true
        }
    );
}


/* =====================================================
   12. STARTUP
   ===================================================== */

console.log(
    "KULZZY CONTESTANT TRACKING LINK FEATURE LOADED."
);
