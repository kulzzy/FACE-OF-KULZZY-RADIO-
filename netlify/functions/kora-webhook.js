const admin = require("firebase-admin");


/* =====================================================
   FIREBASE
===================================================== */

if(
    !admin.apps.length
){

    admin.initializeApp({

        credential:
            admin.credential.cert({

                projectId:
                    process.env.FIREBASE_PROJECT_ID,

                clientEmail:
                    process.env.FIREBASE_CLIENT_EMAIL,

                privateKey:
                    process.env.FIREBASE_PRIVATE_KEY
                        .replace(
                            /\\n/g,
                            "\n"
                        )

            }),

        databaseURL:
            process.env.FIREBASE_DATABASE_URL

    });

}


const db =
    admin.database();


const KORA_BASE =
    "https://api.korapay.com/merchant/api/v1";


/* =====================================================
   RESPONSE
===================================================== */

function json(
    statusCode,
    body
){

    return {

        statusCode,

        headers:{
            "Content-Type":
                "application/json"
        },

        body:
            JSON.stringify(
                body
            )

    };

}


/* =====================================================
   VERIFY KORA TRANSACTION
===================================================== */

async function verifyTransaction(
    reference
){

    const response =
        await fetch(

            `${KORA_BASE}/charges/${encodeURIComponent(reference)}`,

            {

                method:
                    "GET",

                headers:{

                    "Authorization":
                        `Bearer ${process.env.KORA_SECRET_KEY}`,

                    "Content-Type":
                        "application/json"

                }

            }

        );


    const data =
        await response.json();


    if(
        !response.ok ||
        !data.status
    ){

        throw new Error(
            data.message ||
            "Kora verification failed."
        );

    }


    return data.data;

}


/* =====================================================
   CREDIT PAYMENT
===================================================== */

async function creditPayment(
    reference,
    transaction
){

    const paymentRef =
        db.ref(
            `faceOfKulzzy/payments/${reference}`
        );


    const paymentSnapshot =
        await paymentRef.once(
            "value"
        );


    const payment =
        paymentSnapshot.val();


    if(!payment){

        throw new Error(
            "Payment record not found."
        );

    }


    /* -----------------------------------------
       ALREADY CREDITED
    ----------------------------------------- */

    if(
        payment.status ===
            "credited"
    ){

        return {

            alreadyCredited:
                true

        };

    }


    /* -----------------------------------------
       CHECK AMOUNT
    ----------------------------------------- */

    const actualAmount =
        Number(
            transaction.amount_paid ??
            transaction.amount
        );


    const expectedAmount =
        Number(
            payment.amount
        );


    if(
        transaction.currency !==
            "NGN"
    ){

        throw new Error(
            "Wrong payment currency."
        );

    }


    if(
        actualAmount <
        expectedAmount
    ){

        await paymentRef.update({

            status:
                "underpaid",

            actualAmount,

            verifiedAt:
                Date.now()

        });


        return {

            underpaid:
                true

        };

    }


    /* -----------------------------------------
       CALCULATE VOTES
    ----------------------------------------- */

    const votes =

        Math.floor(
            actualAmount / 100
        );


    const contestantRef =
        db.ref(

            `faceOfKulzzy/contestants/${payment.contestantId}`

        );


    /* -----------------------------------------
       ATOMIC CONTESTANT COUNTERS
    ----------------------------------------- */

    await contestantRef.transaction(

        contestant => {

            if(
                contestant === null
            ){

                return contestant;

            }


            contestant.votes =
                Number(
                    contestant.votes || 0
                ) +

                votes;


            contestant.money =
                Number(
                    contestant.money || 0
                ) +

                actualAmount;


            return contestant;

        }

    );


    /* -----------------------------------------
       MARK PAYMENT
    ----------------------------------------- */

    await paymentRef.update({

        status:
            "credited",

        actualAmount,

        creditedVotes:
            votes,

        verifiedAt:
            Date.now(),

        koraReference:
            transaction.reference

    });


    return {

        credited:
            true,

        votes,

        amount:
            actualAmount

    };

}


/* =====================================================
   WEBHOOK
===================================================== */

exports.handler =
    async function(event){

        if(
            event.httpMethod !==
            "POST"
        ){

            return json(

                405,

                {
                    message:
                        "Method not allowed."
                }

            );

        }


        try{

            const payload =
                JSON.parse(
                    event.body || "{}"
                );


            console.log(
                "KORA WEBHOOK:",
                JSON.stringify(
                    payload
                )
            );


            if(
                payload.event !==
                "charge.success"
            ){

                return json(

                    200,

                    {
                        received:
                            true
                    }

                );

            }


            const reference =
                payload.data?.reference;


            if(!reference){

                return json(

                    400,

                    {
                        message:
                            "Missing transaction reference."
                    }

                );

            }


            /* -----------------------------------------
               VERIFY DIRECTLY WITH KORA
            ----------------------------------------- */

            const transaction =
                await verifyTransaction(
                    reference
                );


            if(
                transaction.status !==
                "success"
            ){

                return json(

                    200,

                    {
                        received:
                            true
                    }

                );

            }


            const result =
                await creditPayment(

                    reference,

                    transaction

                );


            return json(

                200,

                {

                    received:
                        true,

                    result

                }

            );

        }

        catch(error){

            console.error(
                "KORA WEBHOOK ERROR:",
                error
            );


            return json(

                500,

                {

                    message:
                        "Webhook processing failed."

                }

            );

        }

    };
