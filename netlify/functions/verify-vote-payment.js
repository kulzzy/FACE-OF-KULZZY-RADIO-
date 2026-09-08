const { getStore } = require("@netlify/blobs");

const ALLOWED_ORIGIN =
  "https://kulzzy.github.io";

const FIREBASE_DATABASE_URL =
  "https://kulzzy-radio-chat-default-rtdb.europe-west1.firebasedatabase.app";


function response(statusCode, body) {

  return {

    statusCode,

    headers: {

      "Content-Type":
        "application/json",

      "Access-Control-Allow-Origin":
        ALLOWED_ORIGIN,

      "Access-Control-Allow-Methods":
        "POST, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type"

    },

    body:
      JSON.stringify(body)

  };

}


/* =====================================================
   FIREBASE URL
===================================================== */

function contestantUrl(
  contestantId
) {

  return (

    FIREBASE_DATABASE_URL +

    "/faceOfKulzzy/contestants/" +

    encodeURIComponent(
      contestantId
    ) +

    ".json?auth=" +

    encodeURIComponent(
      process.env.FIREBASE_DATABASE_SECRET
    )

  );

}


/* =====================================================
   ADD VOTES USING FIREBASE ETAG
===================================================== */

async function addVotesToContestant(
  contestantId,
  votesToAdd
) {

  const url =
    contestantUrl(
      contestantId
    );


  const MAX_RETRIES = 5;


  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {

    /* ---------------------------------------------
       GET CURRENT CONTESTANT + ETAG
    --------------------------------------------- */

    const getResponse =
      await fetch(
        url,
        {
          method: "GET",

          headers: {

            "X-Firebase-ETag":
              "true"

          }

        }
      );


    if (
      !getResponse.ok
    ) {

      throw new Error(
        "Unable to read contestant from Firebase."
      );

    }


    const etag =
      getResponse.headers.get(
        "ETag"
      );


    const contestant =
      await getResponse.json();


    if (!contestant) {

      throw new Error(
        "Contestant no longer exists."
      );

    }


    if (
      contestant.active === false
    ) {

      throw new Error(
        "This contestant is no longer active."
      );

    }


    const currentVotes =
      Number(
        contestant.votes || 0
      );


    const newVotes =
      currentVotes +
      Number(votesToAdd);


    const updatedContestant = {

      ...contestant,

      votes:
        newVotes

    };


    /* ---------------------------------------------
       CONDITIONAL UPDATE
    --------------------------------------------- */

    const updateResponse =
      await fetch(
        url,
        {

          method:
            "PUT",

          headers: {

            "Content-Type":
              "application/json",

            "If-Match":
              etag || "*"

          },

          body:
            JSON.stringify(
              updatedContestant
            )

        }
      );


    /* ---------------------------------------------
       SUCCESS
    --------------------------------------------- */

    if (
      updateResponse.ok
    ) {

      return {

        previousVotes:
          currentVotes,

        newVotes

      };

    }


    /* ---------------------------------------------
       ETAG CONFLICT
       TRY AGAIN
    --------------------------------------------- */

    if (
      updateResponse.status === 412
    ) {

      continue;

    }


    let errorText = "";

    try {

      errorText =
        await updateResponse.text();

    } catch {}

    console.error(
      "FIREBASE UPDATE ERROR:",
      errorText
    );


    throw new Error(
      "Unable to update contestant votes."
    );

  }


  throw new Error(
    "The contestant votes changed while processing the payment. Please try again."
  );

}


/* =====================================================
   MAIN HANDLER
===================================================== */

exports.handler =
  async function(event) {


  if (
    event.httpMethod ===
    "OPTIONS"
  ) {

    return response(
      200,
      {
        success:
          true
      }
    );

  }


  if (
    event.httpMethod !==
    "POST"
  ) {

    return response(
      405,
      {

        success:
          false,

        message:
          "Method not allowed."

      }
    );

  }


  try {

    /* ---------------------------------------------
       CHECK ENVIRONMENT VARIABLES
    --------------------------------------------- */

    if (
      !process.env.FLW_SECRET_KEY
    ) {

      return response(
        500,
        {

          success:
            false,

          message:
            "Flutterwave secret key is not configured."

        }
      );

    }


    if (
      !process.env.FIREBASE_DATABASE_SECRET
    ) {

      return response(
        500,
        {

          success:
            false,

          message:
            "Firebase database secret is not configured."

        }
      );

    }


    /* ---------------------------------------------
       READ REQUEST
    --------------------------------------------- */

    let requestData;

    try {

      requestData =
        JSON.parse(
          event.body || "{}"
        );

    } catch {

      return response(
        400,
        {

          success:
            false,

          message:
            "Invalid verification request."

        }
      );

    }


    const txRef =
      String(
        requestData.txRef || ""
      ).trim();


    const transactionId =
      String(
        requestData.transactionId || ""
      ).trim();


    if (!txRef) {

      return response(
        400,
        {

          success:
            false,

          message:
            "Transaction reference is missing."

        }
      );

    }


    if (!transactionId) {

      return response(
        400,
        {

          success:
            false,

          message:
            "Flutterwave transaction ID is missing."

        }
      );

    }


    /* ---------------------------------------------
       OPEN VOTE STORE
    --------------------------------------------- */

    const store =
      getStore({

        name:
          "kulzzy-face-votes",

        consistency:
          "strong"

      });


    /* ---------------------------------------------
       CHECK IF ALREADY PROCESSED
    --------------------------------------------- */

    const alreadyProcessed =
      await store.get(
        `processed/${txRef}`,
        {
          type:
            "json"
        }
      );


    if (
      alreadyProcessed
    ) {

      return response(
        200,
        {

          success:
            true,

          alreadyProcessed:
            true,

          contestantName:
            alreadyProcessed.contestantName,

          votesAdded:
            alreadyProcessed.votesAdded,

          totalVotes:
            alreadyProcessed.totalVotes,

          message:
            "This payment has already been processed."

        }
      );

    }


    /* ---------------------------------------------
       GET PENDING VOTE
    --------------------------------------------- */

    const pendingVote =
      await store.get(
        `pending/${txRef}`,
        {
          type:
            "json"
        }
      );


    if (
      !pendingVote
    ) {

      return response(
        404,
        {

          success:
            false,

          message:
            "Voting transaction could not be found."

        }
      );

    }


    /* ---------------------------------------------
       VERIFY TRANSACTION WITH FLUTTERWAVE
    --------------------------------------------- */

    const verifyResponse =
      await fetch(

        "https://api.flutterwave.com/v3/transactions/" +

        encodeURIComponent(
          transactionId
        ) +

        "/verify",

        {

          method:
            "GET",

          headers: {

            "Authorization":
              "Bearer " +
              process.env.FLW_SECRET_KEY

          }

        }

      );


    let verification;

    try {

      verification =
        await verifyResponse.json();

    } catch {

      verification = {};

    }


    if (
      !verifyResponse.ok ||
      verification.status !==
        "success" ||
      !verification.data
    ) {

      console.error(
        "FLUTTERWAVE VERIFY ERROR:",
        verification
      );

      return response(
        400,
        {

          success:
            false,

          message:
            "Flutterwave could not verify this payment."

        }
      );

    }


    const payment =
      verification.data;


    /* ---------------------------------------------
       VERIFY PAYMENT STATUS
    --------------------------------------------- */

    const paymentStatus =
      String(
        payment.status || ""
      ).toLowerCase();


    if (
      paymentStatus !==
        "successful" &&
      paymentStatus !==
        "completed"
    ) {

      return response(
        400,
        {

          success:
            false,

          message:
            "Payment was not successful."

        }
      );

    }


    /* ---------------------------------------------
       VERIFY TRANSACTION REFERENCE
    --------------------------------------------- */

    if (
      String(
        payment.tx_ref || ""
      ) !==
      txRef
    ) {

      return response(
        400,
        {

          success:
            false,

          message:
            "Transaction reference does not match."

        }
      );

    }


    /* ---------------------------------------------
       VERIFY CURRENCY
    --------------------------------------------- */

    if (
      String(
        payment.currency || ""
      ).toUpperCase() !==
      "NGN"
    ) {

      return response(
        400,
        {

          success:
            false,

          message:
            "Invalid payment currency."

        }
      );

    }


    /* ---------------------------------------------
       VERIFY AMOUNT
    --------------------------------------------- */

    const paidAmount =
      Number(
        payment.amount
      );


    const expectedAmount =
      Number(
        pendingVote.amount
      );


    if (
      !Number.isFinite(
        paidAmount
      ) ||
      paidAmount !==
        expectedAmount
    ) {

      return response(
        400,
        {

          success:
            false,

          message:
            "The payment amount does not match the voting amount."

        }
      );

    }


    /* ---------------------------------------------
       CALCULATE VERIFIED VOTES
    --------------------------------------------- */

    const votesToAdd =
      expectedAmount /
      100;


    if (
      !Number.isInteger(
        votesToAdd
      ) ||
      votesToAdd < 1
    ) {

      return response(
        400,
        {

          success:
            false,

          message:
            "Invalid voting amount."

        }
      );

    }


    /* ---------------------------------------------
       ADD VERIFIED VOTES
    --------------------------------------------- */

    const updateResult =
      await addVotesToContestant(

        pendingVote.contestantId,

        votesToAdd

      );


    /* ---------------------------------------------
       SAVE PROCESSED PAYMENT
    --------------------------------------------- */

    const processedVote = {

      voteStatus:
        "PAID",

      txRef,

      transactionId:

        String(
          transactionId
        ),

      contestantId:
        pendingVote.contestantId,

      contestantName:
        pendingVote.contestantName,

      voterName:
        pendingVote.voterName,

      voterEmail:
        pendingVote.voterEmail,

      amount:
        expectedAmount,

      votesAdded:
        votesToAdd,

      totalVotes:
        updateResult.newVotes,

      currency:
        "NGN",

      flutterwaveStatus:
        payment.status,

      processedAt:
        new Date().toISOString()

    };


    await store.setJSON(
      `processed/${txRef}`,
      processedVote
    );


    /* ---------------------------------------------
       MARK PENDING RECORD AS PAID
    --------------------------------------------- */

    await store.setJSON(
      `pending/${txRef}`,
      {

        ...pendingVote,

        voteStatus:
          "PAID",

        transactionId:
          String(transactionId),

        processedAt:
          new Date().toISOString()

      }
    );


    /* ---------------------------------------------
       SUCCESS
    --------------------------------------------- */

    return response(
      200,
      {

        success:
          true,

        alreadyProcessed:
          false,

        contestantName:
          pendingVote.contestantName,

        votesAdded:
          votesToAdd,

        totalVotes:
          updateResult.newVotes,

        amount:
          expectedAmount,

        transactionId:
          String(transactionId),

        txRef,

        message:
          "Payment verified and votes added successfully."

      }
    );


  } catch (error) {

    console.error(
      "VERIFY VOTE PAYMENT ERROR:",
      error
    );


    return response(
      500,
      {

        success:
          false,

        message:
          error.message ||
          "Unable to verify payment."

      }
    );

  }

};
