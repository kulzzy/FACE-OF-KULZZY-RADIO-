/* =====================================================
   FACE OF KULZZY RADIO 2026
   ADMIN SYSTEM
   ===================================================== */


/* =====================================================
   FIREBASE CONFIG
   Existing Kulzzy Radio Firebase project
   ===================================================== */

const firebaseConfig = {

    apiKey:
        "AIzaSyBH85NGWsSAK5cubbPdnmunwYZFZpj_CB0",

    authDomain:
        "kulzzy-radio-chat.firebaseapp.com",

    databaseURL:
        "https://kulzzy-radio-chat-default-rtdb.europe-west1.firebasedatabase.app",

    projectId:
        "kulzzy-radio-chat",

    storageBucket:
        "kulzzy-radio-chat.firebasestorage.app",

    messagingSenderId:
        "510100635134",

    appId:
        "1:510100635134:web:9d3b2e983eb6e9a385d4af"

};


/* =====================================================
   FIREBASE IMPORTS
   ===================================================== */

import {
    initializeApp
} from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";


import {

    getAuth,

    signInWithEmailAndPassword,

    onAuthStateChanged,

    signOut

}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {

    getDatabase,

    ref,

    push,

    set,

    update,

    remove,

    onValue

}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";


/* =====================================================
   INITIALIZE FIREBASE
   ===================================================== */

const app =
    initializeApp(firebaseConfig);


const auth =
    getAuth(app);


const db =
    getDatabase(app);


/* =====================================================
   CLOUDINARY
   Existing Kulzzy Cloudinary configuration
   ===================================================== */

const CLOUDINARY_CLOUD_NAME =
    "s4j0x7dk";


const CLOUDINARY_UPLOAD_PRESET =
    "face-of-kulzzy-radio-2026";


/* =====================================================
   SHORT ELEMENT FUNCTION
   ===================================================== */

const $ =
    id => document.getElementById(id);


/* =====================================================
   DATA
   ===================================================== */

let contestants = {};


/* =====================================================
   LOGIN
   ===================================================== */

$("loginBtn").addEventListener(
    "click",
    login
);


async function login(){

    const email =
        $("email").value.trim();


    const password =
        $("password").value;


    if(!email || !password){

        $("loginStatus").textContent =
            "Please enter your email and password.";

        return;

    }


    $("loginBtn").disabled =
        true;


    $("loginStatus").textContent =
        "Logging in...";


    try{

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );


        $("loginStatus").textContent =
            "";

    }

    catch(error){

        console.error(error);

        $("loginStatus").textContent =
            friendlyError(error);

    }


    $("loginBtn").disabled =
        false;

}


/* =====================================================
   AUTH STATE
   ===================================================== */

onAuthStateChanged(
    auth,
    user => {

        if(user){

            $("loginPanel")
                .classList
                .add("hidden");


            $("adminPanel")
                .classList
                .remove("hidden");


            loadContestants();

        }

        else{

            $("loginPanel")
                .classList
                .remove("hidden");


            $("adminPanel")
                .classList
                .add("hidden");

        }

    }
);


/* =====================================================
   FRIENDLY FIREBASE ERRORS
   ===================================================== */

function friendlyError(error){

    const code =
        error?.code || "";


    if(
        code.includes(
            "invalid-credential"
        )
    ){

        return "Incorrect email or password.";

    }


    if(
        code.includes(
            "wrong-password"
        )
    ){

        return "Incorrect password.";

    }


    if(
        code.includes(
            "user-not-found"
        )
    ){

        return "Admin account not found.";

    }


    if(
        code.includes(
            "too-many-requests"
        )
    ){

        return "Too many login attempts. Try again later.";

    }


    return error?.message ||
        "Login failed.";

}


/* =====================================================
   PHOTO PREVIEW
   ===================================================== */

$("photoFile").addEventListener(
    "change",
    () => {

        const file =
            $("photoFile")
                .files[0];


        if(!file){

            return;

        }


        const imageURL =
            URL.createObjectURL(
                file
            );


        $("preview").src =
            imageURL;

    }
);


/* =====================================================
   CLOUDINARY IMAGE UPLOAD
   ===================================================== */

async function uploadImage(file){

    const formData =
        new FormData();


    formData.append(
        "file",
        file
    );


    formData.append(
        "upload_preset",
        CLOUDINARY_UPLOAD_PRESET
    );


    formData.append(
        "folder",
        "face-of-kulzzy-radio-2026"
    );


    const response =
        await fetch(

            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,

            {

                method:
                    "POST",

                body:
                    formData

            }

        );


    const data =
        await response.json();


    if(!response.ok){

        throw new Error(

            data?.error?.message ||
            "Image upload failed."

        );

    }


    return data.secure_url;

}


/* =====================================================
   SAVE CONTESTANT
   ===================================================== */

$("saveBtn").addEventListener(
    "click",
    saveContestant
);


async function saveContestant(){

    const user =
        auth.currentUser;


    if(!user){

        return;

    }


    const number =
        $("contestantNo")
            .value
            .trim();


    const name =
        $("contestantName")
            .value
            .trim();


    const url =
        $("photoUrl")
            .value
            .trim();


    const file =
        $("photoFile")
            .files[0];


    const editId =
        $("editId")
            .value;


    if(!number){

        $("formStatus").textContent =
            "Enter contestant number.";

        return;

    }


    if(!name){

        $("formStatus").textContent =
            "Enter contestant name.";

        return;

    }


    if(!file && !url && !editId){

        $("formStatus").textContent =
            "Upload a contestant picture or enter an image URL.";

        return;

    }


    $("saveBtn").disabled =
        true;


    try{

        let imageUrl =
            url;


        /* -------------------------------------------
           UPLOAD NEW IMAGE
        ------------------------------------------- */

        if(file){

            $("formStatus").textContent =
                "Uploading contestant picture...";


            imageUrl =
                await uploadImage(
                    file
                );

        }


        /* -------------------------------------------
           CREATE OR UPDATE ID
        ------------------------------------------- */

        let contestantId =
            editId;


        let oldData =
            null;


        if(editId){

            oldData =
                contestants[editId];

        }


        if(!contestantId){

            contestantId =
                push(
                    ref(
                        db,
                        "faceOfKulzzy/contestants"
                    )
                ).key;

        }


        /* -------------------------------------------
           CONTESTANT DATA
        ------------------------------------------- */

        const contestant = {

            number:
                number,

            name:
                name,

            imageUrl:
                imageUrl,

            votes:
                Number(
                    oldData?.votes || 0
                ),

            money:
                Number(
                    oldData?.money || 0
                ),

            active:
                oldData?.active !== false,

            createdAt:
                oldData?.createdAt ||
                Date.now(),

            updatedAt:
                Date.now()

        };


        /* -------------------------------------------
           SAVE TO FIREBASE
        ------------------------------------------- */

        await set(

            ref(
                db,
                `faceOfKulzzy/contestants/${contestantId}`
            ),

            contestant

        );


        $("formStatus").textContent =
            editId

                ? "Contestant updated successfully."

                : "Contestant published successfully.";


        clearForm();

    }

    catch(error){

        console.error(error);

        $("formStatus").textContent =
            "Error: " +
            error.message;

    }


    $("saveBtn").disabled =
        false;

}


/* =====================================================
   LOAD CONTESTANTS
   ===================================================== */

function loadContestants(){

    $("listStatus").textContent =
        "Loading contestants...";


    const contestantsRef =
        ref(
            db,
            "faceOfKulzzy/contestants"
        );


    onValue(

        contestantsRef,

        snapshot => {

            contestants =
                snapshot.val() || {};


            renderContestants();


            $("listStatus").textContent =
                Object.keys(
                    contestants
                ).length +

                " contestant(s) found.";

        },

        error => {

            $("listStatus").textContent =
                "Error loading contestants: " +
                error.message;

        }

    );

}


/* =====================================================
   DISPLAY CONTESTANTS
   ===================================================== */

function renderContestants(){

    const rows =
        $("contestantRows");


    rows.innerHTML =
        "";


    const list =
        Object.entries(
            contestants
        );


    list.sort(

        (a,b) =>

            String(
                a[1].number
            ).localeCompare(

                String(
                    b[1].number
                ),

                undefined,

                {
                    numeric:
                        true
                }

            )

    );


    list.forEach(

        ([id, contestant]) => {


            const row =
                document.createElement(
                    "tr"
                );


            row.innerHTML = `

                <td>

                    <img

                        class="thumb"

                        src="${escapeHTML(
                            contestant.imageUrl
                        )}"

                        alt="Contestant"

                    >

                </td>


                <td>

                    ${escapeHTML(
                        contestant.number
                    )}

                </td>


                <td>

                    ${escapeHTML(
                        contestant.name
                    )}

                </td>


                <td>

                    ${Number(
                        contestant.votes || 0
                    ).toLocaleString()}

                </td>


                <td>

                    ₦${Number(
                        contestant.money || 0
                    ).toLocaleString()}

                </td>


                <td>

                    ${
                        contestant.active === false

                        ? "HIDDEN"

                        : "PUBLISHED"

                    }

                </td>


                <td>

                    <button
                        class="secondary"
                        data-edit="${id}"
                    >
                        EDIT
                    </button>


                    <button
                        class="secondary"
                        data-toggle="${id}"
                    >

                        ${
                            contestant.active === false

                            ? "PUBLISH"

                            : "HIDE"

                        }

                    </button>


                    <button
                        class="danger"
                        data-delete="${id}"
                    >
                        DELETE
                    </button>

                </td>

            `;


            rows.appendChild(
                row
            );

        }

    );


    /* EDIT */

    rows.querySelectorAll(
        "[data-edit]"
    ).forEach(

        button => {

            button.onclick =
                () => editContestant(
                    button.dataset.edit
                );

        }

    );


    /* HIDE / PUBLISH */

    rows.querySelectorAll(
        "[data-toggle]"
    ).forEach(

        button => {

            button.onclick =
                () => toggleContestant(
                    button.dataset.toggle
                );

        }

    );


    /* DELETE */

    rows.querySelectorAll(
        "[data-delete]"
    ).forEach(

        button => {

            button.onclick =
                () => deleteContestant(
                    button.dataset.delete
                );

        }

    );

}


/* =====================================================
   EDIT
   ===================================================== */

function editContestant(id){

    const contestant =
        contestants[id];


    if(!contestant){

        return;

    }


    $("editId").value =
        id;


    $("contestantNo").value =
        contestant.number || "";


    $("contestantName").value =
        contestant.name || "";


    $("photoUrl").value =
        contestant.imageUrl || "";


    $("preview").src =
        contestant.imageUrl || "";


    $("formStatus").textContent =
        "Editing contestant #" +
        contestant.number;


    window.scrollTo({

        top:
            0,

        behavior:
            "smooth"

    });

}


/* =====================================================
   HIDE / PUBLISH
   ===================================================== */

async function toggleContestant(id){

    const contestant =
        contestants[id];


    if(!contestant){

        return;

    }


    await update(

        ref(
            db,
            `faceOfKulzzy/contestants/${id}`
        ),

        {

            active:
                contestant.active === false

        }

    );

}


/* =====================================================
   DELETE
   ===================================================== */

async function deleteContestant(id){

    const contestant =
        contestants[id];


    if(!contestant){

        return;

    }


    const confirmed =
        confirm(

            "Delete contestant #" +

            contestant.number +

            " — " +

            contestant.name +

            "?"

        );


    if(!confirmed){

        return;

    }


    await remove(

        ref(
            db,
            `faceOfKulzzy/contestants/${id}`
        )

    );

}


/* =====================================================
   CLEAR FORM
   ===================================================== */

$("clearBtn").addEventListener(
    "click",
    clearForm
);


function clearForm(){

    $("editId").value =
        "";


    $("contestantNo").value =
        "";


    $("contestantName").value =
        "";


    $("photoUrl").value =
        "";


    $("photoFile").value =
        "";


    $("preview")
        .removeAttribute(
            "src"
        );


    $("formStatus").textContent =
        "";

}


/* =====================================================
   REFRESH
   ===================================================== */

$("refreshBtn").addEventListener(

    "click",

    loadContestants

);


/* =====================================================
   LOGOUT
   ===================================================== */

$("logoutBtn").addEventListener(

    "click",

    () => {

        signOut(auth);

    }

);


/* =====================================================
   SECURITY ESCAPE
   ===================================================== */

function escapeHTML(value){

    return String(
        value ?? ""
    )

    .replace(
        /[&<>"']/g,

        character => ({

            "&":
                "&amp;",

            "<":
                "&lt;",

            ">":
                "&gt;",

            '"':
                "&quot;",

            "'":
                "&#039;"

        }[character])

    );

}
