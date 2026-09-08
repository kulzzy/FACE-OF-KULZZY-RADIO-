const { getStore } = require("@netlify/blobs");

const ALLOWED_ORIGIN = "https://kulzzy.github.io";

const FIREBASE_DATABASE_URL =
  "https://kulzzy-radio-chat-default-rtdb.europe-west1.firebasedatabase.app";

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async function (event) {

  if (event.httpMethod === "OPTIONS") {
    return response(200, {
      success: true
    });
  }

  if (event.httpMethod !== "POST") {
    return response(405, {
      success: false,
      message: "Method not allowed"
    });
  }

  try {

    if (!process.env.FLW_SECRET_KEY) {
      return response(500, {
        success: false,
        message: "Flutterwave secret key is not configured."
      });
    }

    if (!process.env.FIREBASE_DATABASE_SECRET) {
      return response(500, {
        success: false,
        message: "Firebase database secret is not configured."
      });
    }

    let data;

    try {

      data = JSON.parse(
        event.body || "{}"
      );

    } catch {

      return response(400, {
        success: false,
        message: "Invalid request data."
      });

    }


    const {
      contestantId,
      amount,
      voterName,
      voterEmail
    } = data;


    /* =================================================
       VALIDATE CONTESTANT
    ================================================= */

    if (
      !contestantId ||
      typeof contestantId !== "string"
    ) {

      return response(400, {
        success: false,
        message: "Invalid contestant."
      });

    }


    /* =================================================
       VALIDATE AMOUNT
    ================================================= */

    const numericAmount =
      Number(amount);


    if (
      !Number.isFinite(numericAmount) ||
      numericAmount < 100 ||
      numericAmount % 100 !== 0
    ) {

      return response(400, {
        success: false,
        message:
          "Voting amount must be at least ₦100 and a multiple of ₦100."
      });

    }


    /* =================================================
       VALIDATE NAME
    ================================================= */

    if (
      !voterName ||
      !String(voterName).trim()
    ) {

      return response(400, {
        success: false,
        message: "Please enter your name."
      });

    }


    /* =================================================
       VALIDATE EMAIL
    ================================================= */

    const email =
      String(voterEmail || "")
        .trim()
        .toLowerCase();


    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {

      return response(400, {
        success: false,
        message: "Please enter a valid email address."
      });

    }


    /* =================================================
       GET CONTESTANT FROM FIREBASE
    ================================================= */

    const contestantUrl =
      FIREBASE_DATABASE_URL +
      "/faceOfKulzzy/contestants/" +
      encodeURIComponent(contestantId) +
      ".json?auth=" +
      encodeURIComponent(
        process.env.FIREBASE_DATABASE_SECRET
      );


    const contestantResponse =
      await fetch(
        contestantUrl
      );


    if (!contestantResponse.ok) {

      return response(500, {
        success: false,
        message: "Unable to check contestant."
      });

    }


    const contestant =
      await contestantResponse.json();


    if (!contestant) {

      return response(404, {
        success: false,
        message: "Contestant not found."
      });

    }


    if (
      contestant.active === false
    ) {

      return response(400, {
        success: false,
        message: "Voting for this contestant is closed."
      });

    }


    /* =================================================
       CREATE UNIQUE TRANSACTION REFERENCE
    ================================================= */

    const txRef =
      "KULZZY-FACE-" +
      Date.now() +
      "-" +
      Math.floor(
        100000 +
        Math.random() * 900000
      );


    /* =================================================
       SAVE PENDING PAYMENT
    ================================================= */

    const store =
      getStore({
        name:
          "kulzzy-face-votes",
        consistency:
          "strong"
      });


    const pendingVote = {

      status:
        "PENDING_PAYMENT",

      txRef,

      contestantId,

      contestantName:
        String(
          contestant.name || ""
        ),

      contestantNumber:
        String(
          contestant.number || ""
        ),

      amount:
        numericAmount,

      votes:
        numericAmount / 100,

      currency:
        "NGN",

      voterName:
        String(
          voterName
        ).trim(),

      voterEmail:
        email,

      createdAt:
        new Date().toISOString()

    };


    await store.setJSON(
      "pending/" + txRef,
      pendingVote
    );


    /* =================================================
       CREATE FLUTTERWAVE PAYMENT
    ================================================= */

    const origin =
      event.headers?.origin ||
      ALLOWED_ORIGIN;


    const redirectUrl =
      origin +
      (
        origin.endsWith("/")
          ? ""
          : "/"
      );


    const flutterwaveResponse =
      await fetch(
        "https://api.flutterwave.com/v3/payments",
        {

          method:
            "POST",

          headers: {

            "Authorization":
              "Bearer " +
              process.env.FLW_SECRET_KEY,

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              tx_ref:
                txRef,

              amount:
                numericAmount,

              currency:
                "NGN",

              redirect_url:
                redirectUrl,

              payment_options:
                "card,banktransfer,ussd",

              customer: {

                email:
                  email,

                name:
                  String(
                    voterName
                  ).trim()

              },

              customizations: {

                title:
                  "FACE OF KULZZY RADIO 2026",

                description:
                  "Vote for " +
                  String(
                    contestant.name || ""
                  ),

                logo:
                  "https://kulzzy.github.io/app/icon-192.png"

              },

              meta: [

                {
                  metaname:
                    "contestantId",

                  metavalue:
                    contestantId
                },

                {
                  metaname:
                    "contestantName",

                  metavalue:
                    String(
                      contestant.name || ""
                    )
                },

                {
                  metaname:
                    "contestantNumber",

                  metavalue:
                    String(
                      contestant.number || ""
                    )
                },

                {
                  metaname:
                    "votes",

                  metavalue:
                    String(
                      numericAmount / 100
                    )
                },

                {
                  metaname:
                    "voterName",

                  metavalue:
                    String(
                      voterName
                    ).trim()
                }

              ]

            })

        }
      );


    let paymentData = {};

    try {

      paymentData =
        await flutterwaveResponse.json();

    } catch {

      paymentData = {};

    }


    if (
      !flutterwaveResponse.ok ||
      paymentData.status !== "success" ||
      !paymentData.data ||
      !paymentData.data.link
    ) {

      console.error(
        "FLUTTERWAVE CREATE ERROR:",
        paymentData
      );


      return response(500, {
        success: false,
        message:
          paymentData.message ||
          "Unable to create Flutterwave payment."
      });

    }


    /* =================================================
       SUCCESS
    ================================================= */

    return response(200, {

      success:
        true,

      txRef,

      amount:
        numericAmount,

      votes:
        numericAmount / 100,

      currency:
        "NGN",

      checkout_url:
        paymentData.data.link

    });

  } catch (error) {

    console.error(
      "CREATE VOTE PAYMENT ERROR:",
      error
    );


    return response(500, {

      success:
        false,

      message:
        "Unable to create payment. Please try again."

    });

  }

};
