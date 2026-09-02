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


/* =====================================================
   SETTINGS
===================================================== */

const VOTE_UNIT =
    100;


const KORA_URL =
    "https://api.korapay.com/merchant/api/v1/charges/initialize";


/* =====================================================
   RESPONSE
===================================================== */

function response(
    statusCode,
    body
){

    return {

        statusCode,

        headers:{

            "Content-Type":
                "application/json",

            "Access-Control-Allow-Origin":
                "*",

            "Access-Control-Allow-Headers":
                "Content-Type"

        },

        body:
            JSON.stringify(
                body
            )

    };

}


/* =====================================================
   HANDLER
===================================================== */

exports.handler =
    async function(event){

        if(
            event.httpMethod !==
            "POST"
        ){

            return response(

                405,

                {
                    message:
                        "Method not allowed."
                }

            );

        }


        try{

            const body =
                JSON.parse(
                    event.body || "{}"
                );


            const {

                contestantId,

                amount,

                voterName,

                voterEmail

            } = body;


            /* -----------------------------------------
               VALIDATE
            ----------------------------------------- */

            if(
                !contestantId ||
                !voterName ||
                !voterEmail
            ){

                return response(

                    400,

                    {
                        message:
                            "Missing required information."
                    }

                );

            }


            const numericAmount =
                Number(
                    amount
                );


            if(
                !Number.isFinite(
                    numericAmount
                ) ||

                numericAmount < VOTE_UNIT ||

                numericAmount %
                    VOTE_UNIT !== 0
            ){

                return response(

                    400,

                    {
                        message:
                            "Invalid voting amount."
                    }

                );

            }


            /* -----------------------------------------
               CHECK CONTESTANT
            ----------------------------------------- */

            const contestantSnapshot =
                await db

                    .ref(
                        `faceOfKulzzy/contestants/${contestantId}`
                    )

                    .once(
                        "value"
                    );


            const contestant =
                contestantSnapshot.val();


            if(
                !contestant ||
                contestant.active === false
            ){

                return response(

                    404,

                    {
                        message:
                            "Contestant not found."
                    }

                );

            }


            /* -----------------------------------------
               UNIQUE PAYMENT REFERENCE
            ----------------------------------------- */

            const reference =

                "FKR-" +

                Date.now() +

                "-" +

                Math.random()
                    .toString(
                        36
                    )
                    .substring(
                        2,
                        9
                    );


            const votes =
                numericAmount /
                VOTE_UNIT;


            /* -----------------------------------------
               SAVE PENDING PAYMENT
            ----------------------------------------- */

            await db

                .ref(
                    `faceOfKulzzy/payments/${reference}`
                )

                .set({

                    reference,

                    contestantId,

                    contestantName:
                        contestant.name,

                    amount:
                        numericAmount,

                    expectedVotes:
                        votes,

                    voterName,

                    voterEmail,

                    status:
                        "pending",

                    createdAt:
                        Date.now()

                });


            /* -----------------------------------------
               KORA
            ----------------------------------------- */

            const koraResponse =
                await fetch(

                    KORA_URL,

                    {

                        method:
                            "POST",

                        headers:{

                            "Authorization":
                                `Bearer ${process.env.KORA_SECRET_KEY}`,

                            "Content-Type":
                                "application/json"

                        },

                        body:
                            JSON.stringify({

                                amount:
                                    numericAmount,

                                currency:
                                    "NGN",

                                reference,

                                narration:
                                    `Face of Kulzzy Radio 2026 vote for ${contestant.name}`,

                                redirect_url:
                                    `${process.env.SITE_URL}/vote-result.html`,

                                notification_url:
                                    `${process.env.SITE_URL}/.netlify/functions/kora-webhook`,

                                customer:{

                                    name:
                                        voterName,

                                    email:
                                        voterEmail

                                },

                                metadata:{

                                    contestantId,

                                    contest:
                                        "face-of-kulzzy-2026"

                                }

                            })

                    }

                );


            const koraData =
                await koraResponse.json();


            if(
                !koraResponse.ok ||
                !koraData.status
            ){

                await db

                    .ref(
                        `faceOfKulzzy/payments/${reference}`
                    )

                    .update({

                        status:
                            "initialization_failed",

                        koraResponse:
                            koraData

                    });


                return response(

                    400,

                    {
                        message:
                            koraData.message ||
                            "Kora payment initialization failed."
                    }

                );

            }


            const checkoutUrl =
                koraData.data?.checkout_url;


            if(!checkoutUrl){

                throw new Error(
                    "Kora did not return a checkout URL."
                );

            }


            await db

                .ref(
                    `faceOfKulzzy/payments/${reference}`
                )

                .update({

                    status:
                        "checkout_created",

                    checkoutUrl

                });


            return response(

                200,

                {

                    success:
                        true,

                    reference,

                    checkout_url:
                        checkoutUrl,

                    votes

                }

            );

        }

        catch(error){

            console.error(
                error
            );


            return response(

                500,

                {

                    message:
                        "Unable to start payment."

                }

            );

        }

    };
