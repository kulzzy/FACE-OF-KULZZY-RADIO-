/* =====================================================
   FACE OF KULZZY RADIO 2026
   ADMIN SYSTEM
   ===================================================== */

/* =====================================================
   FIREBASE CONFIG
   ===================================================== */

const firebaseConfig = {
    apiKey: "AIzaSyD-Oqmq3P5bNoxcHBdkTA9O9W9HVsKDVc",
    authDomain: "face-of-kulzzy-radio-2026.firebaseapp.com",
    databaseURL: "https://face-of-kulzzy-radio-2026-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "face-of-kulzzy-radio-2026",
    storageBucket: "face-of-kulzzy-radio-2026.firebasestorage.app",
    messagingSenderId: "175657004245",
    appId: "1:175657004245:web:022d50bc14ed86e036065c",
    measurementId: "G-WQDFT2B0RH"
};

/* =====================================================
   FIREBASE IMPORTS
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
   INITIALIZE FIREBASE
   ===================================================== */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* =====================================================
   ADMIN SECURITY
   ===================================================== */

const ADMIN_EMAIL = "dstnewz.ng@gmail.com";

/* =====================================================
   CLOUDINARY CONFIGURATION
   ===================================================== */

const CLOUDINARY_CLOUD_NAME = "s4j0x7dk";
const CLOUDINARY_UPLOAD_PRESET = "face-of-kulzzy-radio-2026";

/* =====================================================
   ELEMENT HELPER
   ===================================================== */

const $ = id => document.getElementById(id);

/* =====================================================
   STATUS HELPER
   ===================================================== */

function setStatus(id, message) {
    const element = $(id);

    if (element) {
        element.textContent = message;
    }
}

/* =====================================================
   REQUIRED ELEMENT CHECK
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

const missingElements = requiredElements.filter(id => !$(id));

if (missingElements.length) {
    console.error(
        "Admin HTML is missing required element IDs:",
        missingElements
    );
}

/* =====================================================
   DATA
   ===================================================== */

let contestants = {};
let contestantsListenerStarted = false;
let contestantsListenerError = false;
let contestantsUnsubscribe = null;

/* =====================================================
   FRIENDLY FIREBASE ERRORS
   ===================================================== */

function friendlyError(error) {
    const code = error?.code || "";

    if (code.includes("invalid-credential")) {
        return "Incorrect admin email or password.";
    }

    if (code.includes("wrong-password")) {
        return "Incorrect password.";
    }

    if (code.includes("user-not-found")) {
        return "Admin account not found.";
    }

    if (code.includes("invalid-email")) {
        return "Enter a valid email address.";
    }

    if (code.includes("too-many-requests")) {
        return "Too many login attempts. Try again later.";
    }

    if (code.includes("network-request-failed")) {
        return "Network error. Check your internet connection and try again.";
    }

    if (code.includes("permission-denied")) {
        return "Firebase permission denied. Check your Realtime Database rules and admin login.";
    }

    if (code.includes("unauthorized-domain")) {
        return "This website domain is not authorized in Firebase Authentication.";
    }

    if (code.includes("storage/unauthorized")) {
        return "Cloudinary or image upload permission failed. Check the upload preset.";
    }

    return error?.message || "An unexpected error occurred.";
}

/* =====================================================
   ADMIN AUTHORIZATION
   ===================================================== */

function isAuthorizedAdmin(user) {
    return Boolean(
        user &&
        user.email &&
        user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );
}

/* =====================================================
   LOGIN
   ===================================================== */

if ($("loginBtn")) {
    $("loginBtn").addEventListener("click", login);
}

if ($("password")) {
    $("password").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            login();
        }
    });
}

if ($("email")) {
    $("email").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            login();
        }
    });
}

async function login() {
    const email = $("email")?.value.trim() || "";
    const password = $("password")?.value || "";

    if (!email || !password) {
        setStatus(
            "loginStatus",
            "Please enter your email and password."
        );
        return;
    }

    if ($("loginBtn")) {
        $("loginBtn").disabled = true;
    }

    setStatus("loginStatus", "Logging in...");

    try {
        const credential = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        if (!isAuthorizedAdmin(credential.user)) {
            await signOut(auth);

            setStatus(
                "loginStatus",
                "Access denied. This account is not the authorized admin."
            );

            return;
        }

        setStatus("loginStatus", "Login successful.");

    } catch (error) {
        console.error("Admin login error:", error);

        setStatus(
            "loginStatus",
            friendlyError(error)
        );

    } finally {
        if ($("loginBtn")) {
            $("loginBtn").disabled = false;
        }
    }
}

/* =====================================================
   AUTH STATE
   ===================================================== */

onAuthStateChanged(auth, async user => {
    if (user && isAuthorizedAdmin(user)) {
        if ($("loginPanel")) {
            $("loginPanel").classList.add("hidden");
        }

        if ($("adminPanel")) {
            $("adminPanel").classList.remove("hidden");
        }

        setStatus("loginStatus", "");

        loadContestants();

        return;
    }

    if (user && !isAuthorizedAdmin(user)) {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Unauthorized logout error:", error);
        }

        setStatus(
            "loginStatus",
            "Access denied. Please use the authorized admin account."
        );
    }

    if ($("loginPanel")) {
        $("loginPanel").classList.remove("hidden");
    }

    if ($("adminPanel")) {
        $("adminPanel").classList.add("hidden");
    }

    contestantsListenerStarted = false;

    if (typeof contestantsUnsubscribe === "function") {
        contestantsUnsubscribe();
        contestantsUnsubscribe = null;
    }
});

/* =====================================================
   PHOTO PREVIEW
   ===================================================== */

if ($("photoFile")) {
    $("photoFile").addEventListener("change", () => {
        const file = $("photoFile").files?.[0];

        if (!file) {
            return;
        }

        if (!file.type.startsWith("image/")) {
            setStatus("formStatus", "Please select an image file.");
            $("photoFile").value = "";
            return;
        }

        const previousURL = $("preview").dataset.objectUrl;

        if (previousURL) {
            URL.revokeObjectURL(previousURL);
        }

        const imageURL = URL.createObjectURL(file);

        $("preview").src = imageURL;
        $("preview").dataset.objectUrl = imageURL;

        setStatus("formStatus", "");
    });
}

/* =====================================================
   CLOUDINARY IMAGE UPLOAD
   ===================================================== */

async function uploadImage(file) {
    if (!file) {
        throw new Error("Please select a contestant image.");
    }

    const formData = new FormData();

    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", "face-of-kulzzy-radio-2026");

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
        throw new Error("Image upload returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(
            data?.error?.message || "Image upload failed."
        );
    }

    if (!data?.secure_url) {
        throw new Error("Image upload did not return an image URL.");
    }

    return data.secure_url;
}

/* =====================================================
   SAVE CONTESTANT
   ===================================================== */

if ($("saveBtn")) {
    $("saveBtn").addEventListener("click", saveContestant);
}

async function saveContestant() {
    const user = auth.currentUser;

    if (!isAuthorizedAdmin(user)) {
        setStatus(
            "formStatus",
            "Please log in with the authorized admin account."
        );
        return;
    }

    const number = $("contestantNo").value.trim();
    const name = $("contestantName").value.trim();
    const url = $("photoUrl").value.trim();
    const file = $("photoFile").files?.[0] || null;
    const editId = $("editId").value.trim();

    if (!number) {
        setStatus("formStatus", "Enter contestant number.");
        return;
    }

    if (!name) {
        setStatus("formStatus", "Enter contestant name.");
        return;
    }

    if (!file && !url && !editId) {
        setStatus(
            "formStatus",
            "Upload a contestant picture or enter an image URL."
        );
        return;
    }

    if (url && !file) {
        try {
            new URL(url);
        } catch {
            setStatus(
                "formStatus",
                "Enter a valid image URL."
            );
            return;
        }
    }

    $("saveBtn").disabled = true;

    try {
        let imageUrl = url;
        let oldData = null;

        if (editId) {
            oldData = contestants[editId] || null;

            if (!oldData) {
                throw new Error(
                    "The contestant being edited could not be found. Refresh the list and try again."
                );
            }
        }

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
                ref(db, "faceOfKulzzy/contestants")
            ).key;
        }

        if (!contestantId) {
            throw new Error(
                "Could not create a contestant record."
            );
        }

        const contestant = {
            number,
            name,
            imageUrl,

            votes: Number(oldData?.votes || 0),
            money: Number(oldData?.money || 0),

            active: oldData?.active !== false,

            createdAt: oldData?.createdAt || Date.now(),
            updatedAt: Date.now()
        };

        setStatus(
            "formStatus",
            "Saving contestant..."
        );

        await set(
            ref(
                db,
                `faceOfKulzzy/contestants/${contestantId}`
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
        console.error("Save contestant error:", error);

        setStatus(
            "formStatus",
            "Error: " + friendlyError(error)
        );

    } finally {
        $("saveBtn").disabled = false;
    }
}

/* =====================================================
   LOAD CONTESTANTS
   ===================================================== */

function loadContestants() {
    if (!isAuthorizedAdmin(auth.currentUser)) {
        setStatus(
            "listStatus",
            "Please log in with the authorized admin account."
        );
        return;
    }

    if (contestantsListenerStarted && contestantsUnsubscribe) {
        setStatus("listStatus", "Refreshing contestant list...");
        return;
    }

    setStatus("listStatus", "Loading contestants...");

    const contestantsRef = ref(
        db,
        "faceOfKulzzy/contestants"
    );

    contestantsListenerStarted = true;
    contestantsListenerError = false;

    contestantsUnsubscribe = onValue(
        contestantsRef,

        snapshot => {
            contestants = snapshot.val() || {};

            renderContestants();

            const count = Object.keys(contestants).length;

            setStatus(
                "listStatus",
                `${count} contestant(s) found.`
            );
        },

        error => {
            contestantsListenerError = true;

            console.error(
                "Load contestants error:",
                error
            );

            setStatus(
                "listStatus",
                "Error loading contestants: " +
                friendlyError(error)
            );
        }
    );
}

/* =====================================================
   DISPLAY CONTESTANTS
   ===================================================== */

function renderContestants() {
    const rows = $("contestantRows");

    if (!rows) {
        console.error("Missing contestantRows element.");
        return;
    }

    rows.innerHTML = "";

    const list = Object.entries(contestants);

    list.sort((a, b) =>
        String(a[1]?.number ?? "").localeCompare(
            String(b[1]?.number ?? ""),
            undefined,
            { numeric: true }
        )
    );

    list.forEach(([id, contestant]) => {
        if (!contestant) {
            return;
        }

        const row = document.createElement("tr");

        const imageCell = document.createElement("td");
        const image = document.createElement("img");

        image.className = "thumb";
        image.alt = "Contestant";
        image.loading = "lazy";
        image.src = contestant.imageUrl || "";

        imageCell.appendChild(image);

        const numberCell = document.createElement("td");
        numberCell.textContent = contestant.number ?? "";

        const nameCell = document.createElement("td");
        nameCell.textContent = contestant.name ?? "";

        const votesCell = document.createElement("td");
        votesCell.textContent = Number(
            contestant.votes || 0
        ).toLocaleString();

        const moneyCell = document.createElement("td");
        moneyCell.textContent =
            "₦" + Number(
                contestant.money || 0
            ).toLocaleString();

        const statusCell = document.createElement("td");
        statusCell.textContent =
            contestant.active === false
                ? "HIDDEN"
                : "PUBLISHED";

        const actionsCell = document.createElement("td");

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "secondary";
        editButton.textContent = "EDIT";
        editButton.dataset.edit = id;

        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = "secondary";
        toggleButton.textContent =
            contestant.active === false
                ? "PUBLISH"
                : "HIDE";
        toggleButton.dataset.toggle = id;

        const deleteButton = document.createElement("button");
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
    });

    /* EDIT */

    rows.querySelectorAll("[data-edit]").forEach(button => {
        button.addEventListener("click", () => {
            editContestant(button.dataset.edit);
        });
    });

    /* HIDE / PUBLISH */

    rows.querySelectorAll("[data-toggle]").forEach(button => {
        button.addEventListener("click", () => {
            toggleContestant(button.dataset.toggle);
        });
    });

    /* DELETE */

    rows.querySelectorAll("[data-delete]").forEach(button => {
        button.addEventListener("click", () => {
            deleteContestant(button.dataset.delete);
        });
    });
}

/* =====================================================
   EDIT CONTESTANT
   ===================================================== */

function editContestant(id) {
    const contestant = contestants[id];

    if (!contestant) {
        setStatus("formStatus", "Contestant not found.");
        return;
    }

    $("editId").value = id;
    $("contestantNo").value = contestant.number || "";
    $("contestantName").value = contestant.name || "";
    $("photoUrl").value = contestant.imageUrl || "";

    $("photoFile").value = "";

    const previousURL = $("preview").dataset.objectUrl;

    if (previousURL) {
        URL.revokeObjectURL(previousURL);
        delete $("preview").dataset.objectUrl;
    }

    $("preview").src = contestant.imageUrl || "";

    setStatus(
        "formStatus",
        "Editing contestant #" + contestant.number
    );

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

/* =====================================================
   HIDE / PUBLISH CONTESTANT
   ===================================================== */

async function toggleContestant(id) {
    if (!isAuthorizedAdmin(auth.currentUser)) {
        alert("Please log in with the authorized admin account.");
        return;
    }

    const contestant = contestants[id];

    if (!contestant) {
        alert("Contestant not found.");
        return;
    }

    const newActiveState = contestant.active === false;

    try {
        await update(
            ref(
                db,
                `faceOfKulzzy/contestants/${id}`
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
        console.error("Toggle contestant error:", error);

        alert(
            "Could not update contestant: " +
            friendlyError(error)
        );
    }
}

/* =====================================================
   DELETE CONTESTANT
   ===================================================== */

async function deleteContestant(id) {
    if (!isAuthorizedAdmin(auth.currentUser)) {
        alert("Please log in with the authorized admin account.");
        return;
    }

    const contestant = contestants[id];

    if (!contestant) {
        alert("Contestant not found.");
        return;
    }

    const confirmed = confirm(
        "Delete contestant #" +
        contestant.number +
        " — " +
        contestant.name +
        "?"
    );

    if (!confirmed) {
        return;
    }

    try {
        await remove(
            ref(
                db,
                `faceOfKulzzy/contestants/${id}`
            )
        );

        setStatus(
            "listStatus",
            "Contestant deleted successfully."
        );

        if ($("editId").value === id) {
            clearForm();
        }

    } catch (error) {
        console.error("Delete contestant error:", error);

        alert(
            "Could not delete contestant: " +
            friendlyError(error)
        );
    }
}

/* =====================================================
   CLEAR FORM
   ===================================================== */

if ($("clearBtn")) {
    $("clearBtn").addEventListener("click", clearForm);
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

    if ($("preview")) {
        const previousURL = $("preview").dataset.objectUrl;

        if (previousURL) {
            URL.revokeObjectURL(previousURL);
            delete $("preview").dataset.objectUrl;
        }

        $("preview").removeAttribute("src");
    }

    setStatus("formStatus", "");
}

/* =====================================================
   REFRESH CONTESTANTS
   ===================================================== */

if ($("refreshBtn")) {
    $("refreshBtn").addEventListener("click", () => {
        if (!isAuthorizedAdmin(auth.currentUser)) {
            setStatus(
                "listStatus",
                "Please log in with the authorized admin account."
            );
            return;
        }

        if (typeof contestantsUnsubscribe === "function") {
            contestantsUnsubscribe();
        }

        contestantsUnsubscribe = null;
        contestantsListenerStarted = false;

        loadContestants();
    });
}

/* =====================================================
   LOGOUT
   ===================================================== */

if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", async () => {
        try {
            await signOut(auth);

            setStatus(
                "loginStatus",
                "You have been logged out."
            );

        } catch (error) {
            console.error("Logout error:", error);

            alert(
                "Logout failed: " +
                friendlyError(error)
            );
        }
    });
}

/* =====================================================
   END OF FACE OF KULZZY RADIO ADMIN SYSTEM
   ===================================================== */
