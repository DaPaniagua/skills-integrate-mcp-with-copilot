document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const logoutBtn = document.getElementById("logout-btn");
  const messageDiv = document.getElementById("message");
  const authStatus = document.getElementById("auth-status");
  const adminContainer = document.getElementById("admin-container");
  const adminSummary = document.getElementById("admin-summary");

  let auth = {
    token: localStorage.getItem("authToken") || "",
    role: localStorage.getItem("authRole") || "",
    username: localStorage.getItem("authUsername") || "",
  };

  function setAuth(token, role, username) {
    auth = { token, role, username };
    localStorage.setItem("authToken", token || "");
    localStorage.setItem("authRole", role || "");
    localStorage.setItem("authUsername", username || "");
    updateRoleUI();
  }

  function clearAuth() {
    setAuth("", "", "");
  }

  function getAuthHeaders() {
    if (!auth.token) {
      return {};
    }

    return {
      Authorization: `Bearer ${auth.token}`,
    };
  }

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function isAdminRole(role) {
    return role === "club_admin" || role === "federation_admin";
  }

  function updateRoleUI() {
    if (!auth.token) {
      authStatus.textContent = "Not logged in";
      adminContainer.classList.add("hidden");
      return;
    }

    authStatus.textContent = `Logged in as ${auth.username} (${auth.role})`;

    if (isAdminRole(auth.role)) {
      adminContainer.classList.remove("hidden");
      fetchAdminSummary();
    } else {
      adminContainer.classList.add("hidden");
    }
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";

      // Reset and repopulate activity dropdown.
      activitySelect.innerHTML =
        '<option value="">-- Select an activity --</option>';

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        const deleteButton = (email) => {
          if (!isAdminRole(auth.role)) {
            return "";
          }

          return `<button class="delete-btn" data-activity="${name}" data-email="${email}">Remove</button>`;
        };

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span>${deleteButton(
                        email
                      )}</li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      if (isAdminRole(auth.role)) {
        document.querySelectorAll(".delete-btn").forEach((button) => {
          button.addEventListener("click", handleUnregister);
        });
      }
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    if (!isAdminRole(auth.role)) {
      showMessage("Only admin roles can unregister students.", "error");
      return;
    }

    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  async function fetchAdminSummary() {
    try {
      const response = await fetch("/admin/summary", {
        headers: getAuthHeaders(),
      });

      const result = await response.json();

      if (!response.ok) {
        adminSummary.textContent = result.detail || "Admin access unavailable.";
        return;
      }

      adminSummary.textContent = `${result.message}. Activities tracked: ${result.activity_count}.`;
    } catch (error) {
      adminSummary.textContent = "Admin access unavailable.";
      console.error("Error fetching admin summary:", error);
    }
  }

  async function validateExistingSession() {
    if (!auth.token) {
      return;
    }

    try {
      const response = await fetch("/auth/me", {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        clearAuth();
      }
    } catch (error) {
      clearAuth();
      console.error("Error validating session:", error);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        showMessage(result.detail || "Login failed", "error");
        return;
      }

      setAuth(result.token, result.role, result.username);
      loginForm.reset();
      showMessage(`Welcome ${result.username}!`, "success");
      fetchActivities();
    } catch (error) {
      showMessage("Login request failed. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;

    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password, role: "student" }),
      });

      const result = await response.json();
      if (!response.ok) {
        showMessage(result.detail || "Registration failed", "error");
        return;
      }

      registerForm.reset();
      showMessage("Student account created. Please log in.", "success");
    } catch (error) {
      showMessage("Registration request failed. Please try again.", "error");
      console.error("Error registering:", error);
    }
  });

  logoutBtn.addEventListener("click", async () => {
    if (!auth.token) {
      showMessage("You are already logged out.", "info");
      return;
    }

    try {
      await fetch("/auth/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error("Error logging out:", error);
    }

    clearAuth();
    showMessage("Logged out.", "info");
    fetchActivities();
  });

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!auth.token) {
      showMessage("Please log in before signing up.", "error");
      return;
    }

    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  // Initialize app
  validateExistingSession().then(() => {
    updateRoleUI();
    fetchActivities();
  });
});
