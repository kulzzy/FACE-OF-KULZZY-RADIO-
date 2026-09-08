const { getStore } = require("@netlify/blobs");

const ALLOWED_ORIGIN = "https://kulzzy.github.io";

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


exports.handler = async function (event) {

  if (
    event.httpMethod === "OPTIONS"
  ) {

    return response(
      200,
      {
        success: true
      }
    );

  }


  if (
    event.httpMethod !== "POST"
  ) {

    return response(
      405,
      {
        success: false,
        message:
          "Method not allowed"
      }
    );

  }


  try {

    if (
      !process.env.FLW_SECRET_KEY
    ) {

      return response(
        500,
        {
          success: false,
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
          success: false,
          message:
            "Firebase database secret is not configured."
        }
      );

    }


    let data;

    try {

      data =
        JSON.parse(
          event.body || "{}"
        );

    } catch {

      return response(
        400,
        {
          success: false,
          message:
            "Invalid verification request."
        }
      );

    }


    const {

      txRef,

      transactionId

    } = data;


    /* =================================================
       VALIDATE REQUEST
    ================================================= */

    if (
      !txRef ||
      !transactionId
    ) {

      return response(
        400,
        {
          success: false,
          message:
            "Transaction information is missing."
        }
      );

    }


    /* =================================================
       LOAD PENDING VOTE
    ================================================= */

    const store =
      getStore({

        name:
          "kulzzy-face-votes",

        consistency:
          "strong"

      });


    const pending =
      await store.get(
        "pending/" + txRef,
        {
          type: "json"
        }
      );


    if (!pending) {

      return response(
        404,
        {
          success: false,
          message:
            "Pending vote could not be found."
        }
      );

    }


    /* =================================================
       PREVENT DUPLICATE PROCESSING
    ================================================= */

    if (
      pending.status ===
      "PAID"
    ) {

      return response(
        200,
        {

          success:
            true,

          alreadyProcessed:
            true,

          message:
            "This payment has already been processed.",

          contestantId:
            pending.contestantId,

          votes:
            pending.votes

        }
      );

    }


    /* =================================================
       VERIFY WITH FLUTTERWAVE
    ================================================= */

    const verificationResponse =
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
              process.env.FLW_SECRET_KEY,

            "Content-Type":
              "application/json"

          }

        }

      );


    let verification = {};

    try {

      verification =
        await verificationResponse.json();

    } catch {

      verification = {};

    }


    if (
      !verificationResponse.ok ||
      verification.status !== "success" ||
      !verification.data
    ) {

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


    const transaction =
      verification.data;


    /* =================================================
       CHECK PAYMENT STATUS
    ================================================= */

    if (
      transaction.status !==
        "successful"
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


    /* =================================================
       CHECK TRANSACTION REFERENCE
    ================================================= */

    if (
      String(
        transaction.tx_ref || ""
      ) !==
      String(
        txRef
      )
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


    /* =================================================
       CHECK CURRENCY
    ================================================= */

    if (
      String(
        transaction.currency || ""
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


    /* =================================================
       CHECK AMOUNT
    ================================================= */

    const paidAmount =
      Number(
        transaction.amount
      );


    const expectedAmount =
      Number(
        pending.amount
      );


    if (
      !Number.isFinite(
        paidAmount
      ) ||
      paidAmount <
        expectedAmount
    ) {

      return response(
        400,
        {

          success:
            false,

          message:
            "The verified payment amount does not match the voting amount."

        }
      );

    }


    /* =================================================
       CALCULATE VOTES
    ================================================= */

    const votesToAdd =
      Math.floor(
        expectedAmount / 100
      );


    if (
      votesToAdd < 1
    ) {

      return response(
        400,
        {

          success:
            false,

          message:
            "Invalid vote amount."

        }
      );

    }


    /* =================================================
       GET CURRENT CONTESTANT
    ================================================= */

    const contestantUrl =
      FIREBASE_DATABASE_URL +
      "/faceOfKulzzy/contestants/" +
      encodeURIComponent(
        pending.contestantId
      ) +
      ".json?auth=" +
      encodeURIComponent(
        process.env.FIREBASE_DATABASE_SECRET
      );


    let updateComplete =
      false;


    /*
       Firebase ETag retry loop.

       This protects against two payments
       arriving at almost exactly the same time.
    */

    for (
      let attempt = 0;
      attempt < 10;
      attempt++
    ) {

      const contestantResponse =
        await fetch(
          contestantUrl,
          {

            method:
              "GET",

            headers: {

              "X-Firebase-ETag":
                "true"

            }

          }
        );


      if (
        !contestantResponse.ok
      ) {

        throw new Error(
          "Unable to read contestant."
        );

      }


      const contestant =
        await contestantResponse.json();


      if (!contestant) {

        return response(
          404,
          {

            success:
              false,

            message:
              "Contestant no longer exists."

          }
        );

      }


      if (
        contestant.active === false
      ) {

        return response(
          400,
          {

            success:
              false,

            message:
              "Voting for this contestant is closed."

          }
        );

      }


      const currentVotes =
        Number(
          contestant.votes || 0
        );


      const newVotes =
        currentVotes +
        votesToAdd;


      const etag =
        contestantResponse.headers.get(
          "etag"
        );


      const updateResponse =
        await fetch(
          contestantUrl,
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
              JSON.stringify({

                ...contestant,

                votes:
                  newVotes

              })

          }
        );


      if (
        updateResponse.status ===
        412
      ) {

        continue;

      }


      if (
        !updateResponse.ok
      ) {

        throw new Error(
          "Unable to update contestant votes."
        );

      }


      updateComplete =
        true;

      break;

    }


    if (
      !updateComplete
    ) {

      throw new Error(
        "Unable to safely update votes."
      );

    }


    /* =================================================
       MARK PAYMENT AS PAID
    ================================================= */

    const paidVote = {

      ...pending,

      status:
        "PAID",

      transactionId:
        String(
          transaction.id ||
          transactionId
        ),

      paymentStatus:
        transaction.status,

      paymentType:
        transaction.payment_type ||
        "",

      paidAmount,

      votes:
        votesToAdd,

      verifiedAt:
        new Date().toISOString()

    };


    await store.setJSON(
      "pending/" + txRef,
      paidVote
    );


    /* =================================================
       SAVE COMPLETED PAYMENT
    ================================================= */

    await store.setJSON(
      "paid/" + txRef,
      paidVote
    );


    /* =================================================
       RETURN SUCCESS
    ================================================= */

    return response(
      200,
      {

        success:
          true,

        message:
          "Payment verified and votes added successfully.",

        contestantId:
          pending.contestantId,

        contestantName:
          pending.contestantName,

        votes:
          votesToAdd,

        amount:
          expectedAmount,

        transactionId:
          String(
            transaction.id ||
            transactionId
          ),

        txRef

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
          "Unable to verify payment. Please contact Kulzzy Radio if money was deducted."

      }
    );

  }

};
