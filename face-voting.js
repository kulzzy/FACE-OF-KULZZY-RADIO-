/* =====================================================
   VERIFY PAYMENT & APPROVE VOTES — FIXED
   FACE OF KULZZY RADIO 2026
   ===================================================== */

async function approvePendingRequest(requestId) {
    if (approvingRequests.has(requestId)) {
        return;
    }

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

    if (!request) {
        setStatus(
            "This payment request could not be found. Refresh the page.",
            true
        );
        return;
    }

    if (request.status !== "pending") {
        setStatus(
            "This request is not pending. Refresh the page and check its status.",
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
            "Enter the actual payment received in multiples of ₦100.",
            true
        );

        amountInput.focus();
        return;
    }

    const requestedAmount = Number(
        request.requestedAmount || 0
    );

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

    const votes = amount / VOTE_UNIT;

    const confirmed = confirm(
        "CONFIRM PAYMENT APPROVAL\n\n" +
        "Contestant: " + (contestant.name || "") + "\n" +
        "Contestant number: " + (contestant.number || "") + "\n" +
        "Supporter: " + (request.voterName || "") + "\n" +
        "Payment received: " + money(amount) + "\n" +
        "Votes to approve: " + votes.toLocaleString() + "\n\n" +
        "Have you independently confirmed that this payment was received?"
    );

    if (!confirmed) {
        return;
    }

    /*
       Prevent double-click approval.
    */

    approvingRequests.add(requestId);

    renderPendingRequests();

    setStatus(
        "Verifying approval and saving votes to Firebase..."
    );

    try {
        /*
           Read the latest official vote total before calculating
           the new total. This avoids relying only on the page's
           previously loaded data.
        */

        const { get } = await import(
            "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js"
        );

        const officialSnapshot = await get(
            ref(db, `${ROOT}/officialVotes/${contestantId}`)
        );

        const officialData = officialSnapshot.val() || {};

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
                "The existing contestant totals are invalid. No approval was saved."
            );
        }

        const newTotal = currentVotes + votes;
        const newMoney = currentMoney + amount;
        const now = Date.now();

        /*
           Only update the essential paths needed for approval.

           This avoids making approval depend on optional
           publicVoterRecords and voterRecordPrivateDetails paths.
        */

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
           Save the essential changes atomically.
           If Firebase rejects any required path, the update
           fails and the request is not marked approved.
        */

        await update(ref(db), changes);

        setStatus(
            "SUCCESS! " +
            votes.toLocaleString() +
            " votes approved for " +
            (contestant.name || "the contestant") +
            ". New official total: " +
            newTotal.toLocaleString() +
            "."
        );

    } catch (error) {
        console.error(
            "FACE OF KULZZY VOTE APPROVAL FAILED:",
            error
        );

        const message = error?.message || String(error);

        setStatus(
            "APPROVAL FAILED: " + message +
            ". The request has not been confirmed as approved. Check Firebase permissions and try again.",
            true
        );

    } finally {
        approvingRequests.delete(requestId);

        renderPendingRequests();
    }
}
