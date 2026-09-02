const admin = require("firebase-admin");


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
                "*"

        },

        body:
            JSON.stringify(
                body
            )

    };

}


exports.handler =
    async function(event){

        try{

            const reference =
                event.queryStringParameters
                    ?.reference;


            if(!reference){

                return response(

                    400,

                    {
                        message:
                            "Missing reference."
                    }

                );

            }


            const paymentRef =
                db.ref(
                    `faceOfKulzzy/payments/${reference}`
                );


            const snapshot =
                await paymentRef.once(
                    "value"
                );


            const payment =
                snapshot.val();


            if(!payment){

                return response(

                    404,

                    {
                        message:
                            "Payment not found."
                    }

                );

            }


            /* -----------------------------------------
               ALREADY CREDITED
            ----------------------------------------- */

            if(
                payment.status ===
                    "credited"
            ){

                return response(

                    200,

                    {

                        status:
                            "credited",

                        contestantName:
                            payment.contestantName,

                        votes:
                            payment.creditedVotes,

                        amount:
                            payment.actualAmount

                    }

                );

            }


            /* -----------------------------------------
               VERIFY WITH KORA
            ----------------------------------------- */

            const koraResponse =
                await fetch(

                    `${KORA_BASE}/charges/${encodeURIComponent(reference)}`,

                    {

                        headers:{

                            "Authorization":
                                `Bearer ${process.env.KORA_SECRET_KEY}`

                        }

                    }

                );


            const koraData =
                await koraResponse.json();


            if(
                !koraResponse.ok ||
                !koraData.status
            ){

                return response(

                    200,

                    {
                        status:
                            "pending"
                    }

                );

            }


            const transaction =
                koraData.data;


            if(
                transaction.status !==
                "success"
            ){

                return response(

                    200,

                    {

                        status:
                            transaction.status ||
                            "pending"

                    }

                );

            }


            /* -----------------------------------------
               CREDIT HERE TOO
               Handles redirect arriving before webhook
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


                return response(

                    200,

                    {
                        status:
                            "underpaid"
                    }

                );

            }


            const votes =
                Math.floor(
                    actualAmount / 100
                );


            const contestantRef =
                db.ref(

                    `faceOfKulzzy/contestants/${payment.contestantId}`

                );


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


            return response(

                200,

                {

                    status:
                        "credited",

                    contestantName:
                        payment.contestantName,

                    votes,

                    amount:
                        actualAmount

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
                        "Unable to check payment."

                }

            );

        }

    };
