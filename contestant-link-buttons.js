/* =====================================================
   FACE OF KULZZY RADIO 2026
   CONTESTANT TRACKING LINKS
   File: contestant-link-buttons.js

   Uses the existing Firebase admin login.
   Preserves payment approval and voting code.
   ===================================================== */

import {
    getApps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* =====================================================
   1. CONFIGURATION
   ===================================================== */

const ADMIN_EMAIL = "dstnewz.ng@gmail.com";

const TRACKING_PAGE = "contestant-voters.html";


/* =====================================================
   2. USE THE EXISTING DEFAULT FIREBASE APP
   ===================================================== */

const defaultApp = getApps().find(
    app => app.name === "[DEFAULT]"
);

if (!defaultApp) {
    throw new Error(
        "Firebase default app not found. Check face-admin.js."
    );
}

const auth = getAuth(defaultApp);


/* =====================================================
   3. PAGE ELEMENTS
   ===================================================== */

const contestantRows =
    document.getElementById("contestantRows");

const listStatus =
    document.getElementById("listStatus");

let authorizedAdmin = false;


/* =====================================================
   4. STATUS MESSAGE
   ===================================================== */

function showMessage(message) {
    if (listStatus) {
        listStatus.textContent = message;
    }
}


/* =====================================================
   5. BUILD THE CONTESTANT LINK
   ===================================================== */

function buildTrackingLink(contestantId) {
    const url = new URL(
        TRACKING_PAGE,
        window.location.href
    );

    url.searchParams.set("id", contestantId);

    return url.href;
}


/* =====================================================
   6. REMOVE BUTTONS WHEN ADMIN IS NOT AUTHORIZED
   ===================================================== */

function removeTrackingButtons() {
    document
        .querySelectorAll(".contestant-tracking-button")
        .forEach(button => button.remove());
}


/* =====================================================
   7. COPY LINK
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

    const originalText = "COPY TRACKING LINK";

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
                "Tracking link copied successfully. Send it to the contestant."
            );
        } else {
            window.prompt(
                "Copy this contestant tracking link:",
                link
            );

            button.textContent = "LINK READY";

            showMessage(
                "Copy the displayed link and send it to the contestant."
            );
        }
    } catch (error) {
        console.error(
            "Tracking link copy error:",
            error
        );

        window.prompt(
            "Copy this contestant tracking link:",
            link
        );

        button.textContent = "LINK READY";

        showMessage(
            "Copy the displayed link and send it to the contestant."
        );
    }

    button.disabled = false;

    setTimeout(() => {
        if (button.isConnected) {
            button.textContent = originalText;
        }
    }, 2500);
}


/* =====================================================
   8. ADD BUTTONS TO CONTESTANT ROWS
   ===================================================== */

function addTrackingButtons() {
    if (
        !authorizedAdmin ||
        !contestantRows
    ) {
        return;
    }

    const rows =
        contestantRows.querySelectorAll("tr");

    rows.forEach(row => {
        const actionsCell = row.lastElementChild;

        if (!actionsCell) {
            return;
        }

        /*
         * The existing EDIT button contains
         * the contestant's Firebase database ID.
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

        let button =
            actionsCell.querySelector(
                ".contestant-tracking-button"
            );

        if (!button) {
            button = document.createElement("button");

            button.type = "button";

            button.className =
                "secondary contestant-tracking-button";

            button.textContent =
                "COPY TRACKING LINK";

            button.style.display = "block";
            button.style.width = "100%";
            button.style.marginTop = "8px";
            button.style.whiteSpace = "normal";
            button.style.overflowWrap = "anywhere";

            actionsCell.appendChild(button);
        }

        /*
         * Assign the click action.
         */

        button.onclick = () => {
            copyTrackingLink(
                contestantId,
                button
            );
        };
    });
}


/* =====================================================
   9. WATCH FOR CONTESTANT LIST CHANGES
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
   10. USE THE EXISTING ADMIN LOGIN SESSION
   ===================================================== */

onAuthStateChanged(
    auth,

    user => {
        authorizedAdmin = Boolean(
            user &&
            user.email &&
            user.email.toLowerCase() ===
                ADMIN_EMAIL.toLowerCase()
        );

        if (authorizedAdmin) {
            addTrackingButtons();

            showMessage(
                "Admin verified. Contestant tracking links are available."
            );
        } else {
            removeTrackingButtons();
        }
    },

    error => {
        console.error(
            "Tracking-link authentication error:",
            error
        );

        authorizedAdmin = false;

        removeTrackingButtons();

        showMessage(
            "Unable to verify admin login. Refresh the page and log in again."
        );
    }
);


/* =====================================================
   11. STARTUP
   ===================================================== */

console.log(
    "FACE OF KULZZY RADIO: TRACKING LINK FEATURE LOADED."
);
