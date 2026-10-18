/* =====================================================
   FACE OF KULZZY RADIO 2026
   COMPLETE ADMIN SYSTEM
   File: face-admin.js
   ===================================================== */


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
   2. FIREBASE IMPORTS
   ===================================================== */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getDatabase,
    ref,
    push,
    set,
    update,
    remove,
    onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";


/* =====================================================
   3. INITIALIZE FIREBASE
   ===================================================== */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);


/* =====================================================
   4. ADMIN SECURITY
   ===================================================== */

const ADMIN_EMAIL = "dstnewz.ng@gmail.com";


function isAuthorizedAdmin(user) {
    return Boolean(
        user &&
        user.email &&
        user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );
}


/* =====================================================
   5. CLOUDINARY CONFIGURATION
   ===================================================== */

const CLOUDINARY_CLOUD_NAME = "s4j0x7dk";

const CLOUDINARY_UPLOAD_PRESET =
    "face-of-kulzzy-radio-2026";


/* =====================================================
   6. DATABASE PATHS

   Keep these paths consistent with the public page.
   ===================================================== */

const CONTESTANTS_PATH =
    "faceOfKulzzy/contestants";


/* =====================================================
   7. HTML ELEMENT HELPER
   ===================================================== */

const $ = id => document.getElementById(id);


function setStatus(id, message) {
    const element = $(id);

    if (element) {
        element.textContent = message;
    }
}


/* =====================================================
   8. CHECK REQUIRED HTML ELEMENTS
   ===================================================== */

const requiredElements = [
    "loginBtn",
    "email",
    "password",
    "loginStatus",
    "loginPanel",
    "adminPanel",
    "photoFile",
    "preview",
    "saveBtn",
    "contestantNo",
    "contestantName",
    "photoUrl",
    "editId",
    "formStatus",
    "listStatus",
    "contestantRows",
    "clearBtn",
    "refreshBtn",
    "logoutBtn"
];


function checkRequiredElements() {
    const missing = requiredElements.filter(
        id => !$(id)
    );

    if (missing.length) {
        console.error(
            "FACE OF KULZZY ADMIN: Missing HTML elements:",
            missing
        );

        setStatus(
            "loginStatus",
            "Admin page setup error. Missing HTML elements: " +
            missing.join(", ")
        );

        return false;
    }

    return true;
}


/* =====================================================
   9. APPLICATION STATE
   ===================================================== */

let contestants = {};

let contestantsListenerStarted = false;

let contestantsUnsubscribe = null;

let loginInProgress = false;

let savingContestant = false;


/* =====================================================
   10. FRIENDLY ERROR MESSAGES
   ===================================================== */

function friendlyError(error) {
    const code = error?.code || "";

    const message = error?.message || "";

    console.error(
        "FACE OF KULZZY ADMIN ERROR:",
        code,
        message
    );

    if (
        code.includes("invalid-credential") ||
        code.includes("wrong-password")
    ) {
        return "Incorrect admin email or password.";
    }

    if (
        code.includes("user-not-found") ||
        code.includes("auth/user-not-found")
    ) {
        return "Admin account not found. Check the Firebase Authentication account.";
    }

    if (
        code.includes("invalid-email") ||
        code.includes("auth/invalid-email")
    ) {
        return "Please enter a valid email address.";
    }

    if (
        code.includes("too-many-requests")
    ) {
        return "Too many login attempts. Please wait and try again.";
    }

    if (
        code.includes("network-request-failed")
    ) {
        return "Network connection failed. Check your internet and try again.";
    }

    if (
        code.includes("unauthorized-domain")
    ) {
        return "This website domain is not authorized in Firebase Authentication.";
    }

    if (
        code.includes("operation-not-allowed")
    ) {
        return "Email/password login is disabled in Firebase Authentication.";
    }

    if (
        code.includes("email-already-in-use")
    ) {
        return "This email is already registered.";
    }

    if (
        code.includes("weak-password")
    ) {
        return "The password does not meet Firebase password requirements.";
    }

    if (
        code.includes("permission-denied") ||
        code.includes("PERMISSION_DENIED")
    ) {
        return "Firebase denied database access. Check your Realtime Database rules.";
    }

    if (
        code.includes("storage/unauthorized")
    ) {
        return "Image upload was rejected. Check the Cloudinary upload preset.";
    }

    if (
        code.includes("storage/") ||
        code.includes("upload")
    ) {
        return "Image upload failed. Check your internet and Cloudinary configuration.";
    }

    if (
        code.includes("auth/")
    ) {
        return "Firebase login failed: " + code.replace("auth/", "");
    }

    return message || "An unexpected error occurred. Check the browser console.";
}


/* =====================================================
   11. LOGIN
   ===================================================== */

async function login() {
    if (loginInProgress) {
        return;
    }

    const emailElement = $("email");

    const passwordElement = $("password");

    const loginButton = $("loginBtn");

    if (!emailElement || !passwordElement) {
        setStatus(
            "loginStatus",
            "Login form elements are missing from face-admin.html."
        );

        return;
    }

    const email = emailElement.value.trim();

    const password = passwordElement.value;

    if (!email || !password) {
        setStatus(
            "loginStatus",
            "Please enter your admin email and password."
        );

        return;
    }

    if (
        email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
    ) {
        setStatus(
            "loginStatus",
            "Access denied. Please use the authorized admin email."
        );

        return;
    }

    loginInProgress = true;

    if (loginButton) {
        loginButton.disabled = true;
    }

    setStatus(
        "loginStatus",
        "Connecting to Firebase..."
    );

    try {
        const credential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        if (!isAuthorizedAdmin(credential.user)) {
            await signOut(auth);

            setStatus(
                "loginStatus",
                "Access denied. This account is not authorized."
            );

            return;
        }

        setStatus(
            "loginStatus",
            "Login successful. Opening admin dashboard..."
        );

        showAdminPanel();

        loadContestants();

    } catch (error) {
        setStatus(
            "loginStatus",
            friendlyError(error)
        );

    } finally {
        loginInProgress = false;

        if (loginButton) {
            loginButton.disabled = false;
        }
    }
}


/* =====================================================
   12. LOGIN BUTTON AND ENTER KEY
   ===================================================== */

if ($("loginBtn")) {
    $("loginBtn").addEventListener(
        "click",
        event => {
            event.preventDefault();
            login();
        }
    );
}


if ($("password")) {
    $("password").addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                event.preventDefault();
                login();
            }
        }
    );
}


if ($("email")) {
    $("email").addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                event.preventDefault();
                login();
            }
        }
    );
}


/* =====================================================
   13. SHOW AND HIDE ADMIN PANELS
   ===================================================== */

function showAdminPanel() {
    if ($("loginPanel")) {
        $("loginPanel").classList.add("hidden");
    }

    if ($("adminPanel")) {
        $("adminPanel").classList.remove("hidden");
    }
}


function showLoginPanel() {
    if ($("loginPanel")) {
        $("loginPanel").classList.remove("hidden");
    }

    if ($("adminPanel")) {
        $("adminPanel").classList.add("hidden");
    }
}


/* =====================================================
   14. AUTHENTICATION STATE
   ===================================================== */

onAuthStateChanged(
    auth,

    async user => {
        if (user && isAuthorizedAdmin(user)) {
            showAdminPanel();

            setStatus(
                "loginStatus",
                ""
            );

            loadContestants();

            return;
        }

        if (user && !isAuthorizedAdmin(user)) {
            try {
                await signOut(auth);
            } catch (error) {
                console.error(
                    "Unauthorized logout error:",
                    error
                );
            }

            setStatus(
                "loginStatus",
                "Access denied. Use the authorized admin account."
            );
        }

        showLoginPanel();

        contestantsListenerStarted = false;

        if (typeof contestantsUnsubscribe === "function") {
            contestantsUnsubscribe();
        }

        contestantsUnsubscribe = null;

        contestants = {};
    },

    error => {
        console.error(
            "Authentication state error:",
            error
        );

        setStatus(
            "loginStatus",
            friendlyError(error)
        );

        showLoginPanel();
    }
);


/* =====================================================
   15. PHOTO PREVIEW
   ===================================================== */

if ($("photoFile")) {
    $("photoFile").addEventListener(
        "change",
        () => {
            const file = $("photoFile").files?.[0];

            if (!file) {
                return;
            }

            if (!file.type.startsWith("image/")) {
                setStatus(
                    "formStatus",
                    "Please select a valid image file."
                );

                $("photoFile").value = "";

                return;
            }

            const previousURL =
                $("preview")?.dataset.objectUrl;

            if (previousURL) {
                URL.revokeObjectURL(previousURL);
            }

            const imageURL =
                URL.createObjectURL(file);

            $("preview").src = imageURL;

            $("preview").dataset.objectUrl =
                imageURL;

            setStatus(
                "formStatus",
                ""
            );
        }
    );
}


/* =====================================================
   16. CLOUDINARY IMAGE UPLOAD
   ===================================================== */

async function uploadImage(file) {
    if (!file) {
        throw new Error(
            "Please select a contestant image."
        );
    }

    if (!file.type.startsWith("image/")) {
        throw new Error(
            "The selected file is not an image."
        );
    }

    const formData = new FormData();

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

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
            method: "POST",
            body: formData
        }
    );

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            "Cloudinary returned an invalid response."
        );
    }

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
            "Cloudinary image upload failed."
        );
    }

    if (!data?.secure_url) {
        throw new Error(
            "Cloudinary did not return a secure image URL."
        );
    }

    return data.secure_url;
}


/* =====================================================
   17. SAVE CONTESTANT BUTTON
   ===================================================== */

if ($("saveBtn")) {
    $("saveBtn").addEventListener(
        "click",
        event => {
            event.preventDefault();
            saveContestant();
        }
    );
}


/* =====================================================
   18. ADD OR UPDATE CONTESTANT
   ===================================================== */

async function saveContestant() {
    if (savingContestant) {
        return;
    }

    if (!isAuthorizedAdmin(auth.currentUser)) {
        setStatus(
            "formStatus",
            "Please log in with the authorized admin account."
        );

        return;
    }

    const numberElement = $("contestantNo");

    const nameElement = $("contestantName");

    const urlElement = $("photoUrl");

    const fileElement = $("photoFile");

    const editElement = $("editId");

    const saveButton = $("saveBtn");

    if (
        !numberElement ||
        !nameElement ||
        !urlElement ||
        !fileElement ||
        !editElement
    ) {
        setStatus(
            "formStatus",
            "The contestant form is incomplete. Check face-admin.html."
        );

        return;
    }

    const number = numberElement.value.trim();

    const name = nameElement.value.trim();

    const url = urlElement.value.trim();

    const file = fileElement.files?.[0] || null;

    const editId = editElement.value.trim();

    if (!number) {
        setStatus(
            "formStatus",
            "Enter the contestant number."
        );

        return;
    }

    if (!name) {
        setStatus(
            "formStatus",
            "Enter the contestant name."
        );

        return;
    }

    if (!file && !url && !editId) {
        setStatus(
            "formStatus",
            "Select a contestant picture or enter an image URL."
        );

        return;
    }

    if (url && !file) {
        try {
            const parsedURL = new URL(url);

            if (
                parsedURL.protocol !== "https:" &&
                parsedURL.protocol !== "http:"
            ) {
                throw new Error(
                    "Invalid image URL protocol."
                );
            }

        } catch {
            setStatus(
                "formStatus",
                "Enter a valid image URL beginning with https:// or http://."
            );

            return;
        }
    }

    savingContestant = true;

    if (saveButton) {
        saveButton.disabled = true;
    }

    try {
        let oldData = null;

        if (editId) {
            oldData = contestants[editId] || null;

            if (!oldData) {
                throw new Error(
                    "Contestant not found. Refresh the contestant list and try again."
                );
            }
        }

        let imageUrl = url;

        if (file) {
            setStatus(
                "formStatus",
                "Uploading contestant picture..."
            );

            imageUrl = await uploadImage(file);

        } else if (editId && !imageUrl) {
            imageUrl = oldData?.imageUrl || "";
        }

        if (!imageUrl) {
            throw new Error(
                "A contestant image is required."
            );
        }

        let contestantId = editId;

        if (!contestantId) {
            contestantId = push(
                ref(
                    db,
                    CONTESTANTS_PATH
                )
            ).key;
        }

        if (!contestantId) {
            throw new Error(
                "Unable to create the contestant record."
            );
        }

        const contestant = {
            number: number,

            name: name,

            imageUrl: imageUrl,

            votes: Number(
                oldData?.votes || 0
            ),

            money: Number(
                oldData?.money || 0
            ),

            active: oldData?.active !== false,

            createdAt:
                oldData?.createdAt || Date.now(),

            updatedAt: Date.now()
        };

        setStatus(
            "formStatus",
            "Saving contestant to Firebase..."
        );

        await set(
            ref(
                db,
                `${CONTESTANTS_PATH}/${contestantId}`
            ),
            contestant
        );

        setStatus(
            "formStatus",
            editId
                ? "Contestant updated successfully."
                : "Contestant published successfully."
        );

        clearForm();

    } catch (error) {
        console.error(
            "Save contestant error:",
            error
        );

        setStatus(
            "formStatus",
            "Error: " + friendlyError(error)
        );

    } finally {
        savingContestant = false;

        if (saveButton) {
            saveButton.disabled = false;
        }
    }
}


/* =====================================================
   19. LOAD CONTESTANTS
   ===================================================== */

function loadContestants() {
    if (!isAuthorizedAdmin(auth.currentUser)) {
        setStatus(
            "listStatus",
            "Please log in with the authorized admin account."
        );

        return;
    }

    if (contestantsListenerStarted) {
        return;
    }

    setStatus(
        "listStatus",
        "Connecting to contestant database..."
    );

    const contestantsRef = ref(
        db,
        CONTESTANTS_PATH
    );

    contestantsListenerStarted = true;

    contestantsUnsubscribe = onValue(
        contestantsRef,

        snapshot => {
            contestants = snapshot.val() || {};

            renderContestants();

            const count =
                Object.keys(contestants).length;

            setStatus(
                "listStatus",
                count === 0
                    ? "No contestants found in the database."
                    : `${count} contestant(s) loaded successfully.`
            );
        },

        error => {
            contestantsListenerStarted = false;

            contestantsUnsubscribe = null;

            console.error(
                "Load contestants error:",
                error
            );

            setStatus(
                "listStatus",
                "Could not load contestants: " +
                friendlyError(error)
            );
        }
    );
}


/* =====================================================
   20. DISPLAY CONTESTANTS
   ===================================================== */

function renderContestants() {
    const rows = $("contestantRows");

    if (!rows) {
        console.error(
            "The contestantRows element is missing."
        );

        return;
    }

    rows.innerHTML = "";

    const list = Object.entries(
        contestants || {}
    );

    list.sort(
        (a, b) => {
            const first = a[1]?.number ?? "";

            const second = b[1]?.number ?? "";

            return String(first).localeCompare(
                String(second),
                undefined,
                {
                    numeric: true,
                    sensitivity: "base"
                }
            );
        }
    );

    if (list.length === 0) {
        const row = document.createElement("tr");

        const cell = document.createElement("td");

        cell.colSpan = 7;

        cell.textContent =
            "No contestants have been added yet.";

        row.appendChild(cell);

        rows.appendChild(row);

        return;
    }

    list.forEach(
        ([id, contestant]) => {
            if (!contestant) {
                return;
            }

            const row = document.createElement("tr");

            const imageCell =
                document.createElement("td");

            const image =
                document.createElement("img");

            image.className = "thumb";

            image.alt =
                contestant.name
                    ? `${contestant.name} photo`
                    : "Contestant photo";

            image.loading = "lazy";

            image.src =
                contestant.imageUrl || "";

            image.onerror = () => {
                image.style.display = "none";
            };

            imageCell.appendChild(image);


            const numberCell =
                document.createElement("td");

            numberCell.textContent =
                contestant.number ?? "";


            const nameCell =
                document.createElement("td");

            nameCell.textContent =
                contestant.name ?? "";


            const votesCell =
                document.createElement("td");

            votesCell.textContent =
                Number(
                    contestant.votes || 0
                ).toLocaleString();


            const moneyCell =
                document.createElement("td");

            moneyCell.textContent =
                "₦" +
                Number(
                    contestant.money || 0
                ).toLocaleString();


            const statusCell =
                document.createElement("td");

            statusCell.textContent =
                contestant.active === false
                    ? "HIDDEN"
                    : "PUBLISHED";


            const actionsCell =
                document.createElement("td");


            const editButton =
                document.createElement("button");

            editButton.type = "button";

            editButton.className = "secondary";

            editButton.textContent = "EDIT";

            editButton.dataset.edit = id;


            const toggleButton =
                document.createElement("button");

            toggleButton.type = "button";

            toggleButton.className = "secondary";

            toggleButton.textContent =
                contestant.active === false
                    ? "PUBLISH"
                    : "HIDE";

            toggleButton.dataset.toggle = id;


            const deleteButton =
                document.createElement("button");

            deleteButton.type = "button";

            deleteButton.className = "danger";

            deleteButton.textContent = "DELETE";

            deleteButton.dataset.delete = id;


            actionsCell.append(
                editButton,
                toggleButton,
                deleteButton
            );


            row.append(
                imageCell,
                numberCell,
                nameCell,
                votesCell,
                moneyCell,
                statusCell,
                actionsCell
            );

            rows.appendChild(row);
        }
    );
}


/* =====================================================
   21. EDIT CONTESTANT
   ===================================================== */

function editContestant(id) {
    if (!isAuthorizedAdmin(auth.currentUser)) {
        setStatus(
            "formStatus",
            "Please log in first."
        );

        return;
    }

    const contestant = contestants[id];

    if (!contestant) {
        setStatus(
            "formStatus",
            "Contestant not found."
        );

        return;
    }

    $("editId").value = id;

    $("contestantNo").value =
        contestant.number || "";

    $("contestantName").value =
        contestant.name || "";

    $("photoUrl").value =
        contestant.imageUrl || "";

    $("photoFile").value = "";

    const preview = $("preview");

    if (preview) {
        const previousURL =
            preview.dataset.objectUrl;

        if (previousURL) {
            URL.revokeObjectURL(previousURL);

            delete preview.dataset.objectUrl;
        }

        preview.src =
            contestant.imageUrl || "";
    }

    setStatus(
        "formStatus",
        "Editing contestant #" +
        (contestant.number || "")
    );

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =====================================================
   22. HIDE OR PUBLISH CONTESTANT
   ===================================================== */

async function toggleContestant(id) {
    if (!isAuthorizedAdmin(auth.currentUser)) {
        alert(
            "Please log in with the authorized admin account."
        );

        return;
    }

    const contestant = contestants[id];

    if (!contestant) {
        alert(
            "Contestant not found."
        );

        return;
    }

    const newActiveState =
        contestant.active === false;

    try {
        await update(
            ref(
                db,
                `${CONTESTANTS_PATH}/${id}`
            ),
            {
                active: newActiveState,

                updatedAt: Date.now()
            }
        );

        setStatus(
            "listStatus",
            newActiveState
                ? "Contestant published successfully."
                : "Contestant hidden successfully."
        );

    } catch (error) {
        console.error(
            "Toggle contestant error:",
            error
        );

        alert(
            "Could not update contestant: " +
            friendlyError(error)
        );
    }
}


/* =====================================================
   23. DELETE CONTESTANT
   ===================================================== */

async function deleteContestant(id) {
    if (!isAuthorizedAdmin(auth.currentUser)) {
        alert(
            "Please log in with the authorized admin account."
        );

        return;
    }

    const contestant = contestants[id];

    if (!contestant) {
        alert(
            "Contestant not found."
        );

        return;
    }

    const confirmed = confirm(
        "Are you sure you want to delete contestant #" +
        contestant.number +
        " — " +
        contestant.name +
        "?\n\nThis action cannot be undone."
    );

    if (!confirmed) {
        return;
    }

    try {
        await remove(
            ref(
                db,
                `${CONTESTANTS_PATH}/${id}`
            )
        );

        setStatus(
            "listStatus",
            "Contestant deleted successfully."
        );

        if (
            $("editId") &&
            $("editId").value === id
        ) {
            clearForm();
        }

    } catch (error) {
        console.error(
            "Delete contestant error:",
            error
        );

        alert(
            "Could not delete contestant: " +
            friendlyError(error)
        );
    }
}


/* =====================================================
   24. CLEAR FORM
   ===================================================== */

if ($("clearBtn")) {
    $("clearBtn").addEventListener(
        "click",
        event => {
            event.preventDefault();
            clearForm();
        }
    );
}


function clearForm() {
    if ($("editId")) {
        $("editId").value = "";
    }

    if ($("contestantNo")) {
        $("contestantNo").value = "";
    }

    if ($("contestantName")) {
        $("contestantName").value = "";
    }

    if ($("photoUrl")) {
        $("photoUrl").value = "";
    }

    if ($("photoFile")) {
        $("photoFile").value = "";
    }

    const preview = $("preview");

    if (preview) {
        const previousURL =
            preview.dataset.objectUrl;

        if (previousURL) {
            URL.revokeObjectURL(previousURL);

            delete preview.dataset.objectUrl;
        }

        preview.removeAttribute("src");
    }

    setStatus(
        "formStatus",
        ""
    );
}


/* =====================================================
   25. REFRESH CONTESTANTS
   ===================================================== */

if ($("refreshBtn")) {
    $("refreshBtn").addEventListener(
        "click",
        event => {
            event.preventDefault();

            if (!isAuthorizedAdmin(auth.currentUser)) {
                setStatus(
                    "listStatus",
                    "Please log in with the authorized admin account."
                );

                return;
            }

            if (
                typeof contestantsUnsubscribe === "function"
            ) {
                contestantsUnsubscribe();
            }

            contestantsUnsubscribe = null;

            contestantsListenerStarted = false;

            loadContestants();
        }
    );
}


/* =====================================================
   26. LOGOUT
   ===================================================== */

if ($("logoutBtn")) {
    $("logoutBtn").addEventListener(
        "click",
        async event => {
            event.preventDefault();

            try {
                await signOut(auth);

                setStatus(
                    "loginStatus",
                    "You have been logged out."
                );

                showLoginPanel();

            } catch (error) {
                console.error(
                    "Logout error:",
                    error
                );

                alert(
                    "Logout failed: " +
                    friendlyError(error)
                );
            }
        }
    );
}


/* =====================================================
   27. STARTUP CHECK
   ===================================================== */

checkRequiredElements();

console.log(
    "FACE OF KULZZY RADIO 2026 ADMIN SYSTEM LOADED."
);
