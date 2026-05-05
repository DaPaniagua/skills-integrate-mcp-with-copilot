"""High School Management System API."""

from typing import Callable
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import os
from pathlib import Path

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}

# In-memory user store with one seeded account for each role.
users = {
    "student1": {
        "password": "studentpass",
        "email": "student1@mergington.edu",
        "role": "student",
    },
    "clubadmin1": {
        "password": "clubadminpass",
        "email": "clubadmin1@mergington.edu",
        "role": "club_admin",
    },
    "federation1": {
        "password": "federationpass",
        "email": "federation1@mergington.edu",
        "role": "federation_admin",
    },
}

# token -> username
active_tokens = {}


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str
    role: str = "student"


class LoginRequest(BaseModel):
    username: str
    password: str


def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    username = active_tokens.get(token)
    if not username or username not in users:
        raise HTTPException(status_code=401, detail="Invalid token")

    return {
        "username": username,
        "email": users[username]["email"],
        "role": users[username]["role"],
        "token": token,
    }


def require_roles(*allowed_roles: str) -> Callable:
    def dependency(current_user=Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return current_user

    return dependency


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/auth/register")
def register(payload: RegisterRequest):
    if payload.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")

    if payload.role not in {"student", "club_admin", "federation_admin"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    # Self-registration is limited to students; admin roles come from seeded users.
    if payload.role != "student":
        raise HTTPException(status_code=403, detail="Only student self-registration is allowed")

    users[payload.username] = {
        "password": payload.password,
        "email": payload.email,
        "role": payload.role,
    }

    return {
        "message": "User registered",
        "username": payload.username,
        "role": payload.role,
    }


@app.post("/auth/login")
def login(payload: LoginRequest):
    user = users.get(payload.username)
    if not user or user["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = str(uuid4())
    active_tokens[token] = payload.username
    return {
        "token": token,
        "token_type": "bearer",
        "username": payload.username,
        "email": user["email"],
        "role": user["role"],
    }


@app.post("/auth/logout")
def logout(current_user=Depends(get_current_user)):
    active_tokens.pop(current_user["token"], None)
    return {"message": "Logged out"}


@app.get("/auth/me")
def auth_me(current_user=Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "email": current_user["email"],
        "role": current_user["role"],
    }


@app.get("/admin/summary")
def admin_summary(
    current_user=Depends(require_roles("club_admin", "federation_admin")),
):
    return {
        "message": "Admin access granted",
        "requested_by": current_user["username"],
        "role": current_user["role"],
        "activity_count": len(activities),
    }


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, current_user=Depends(get_current_user)):
    """Sign up a student for an activity"""
    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    email = current_user["email"]

    # Validate student is not already signed up
    if email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    # Add student
    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(
    activity_name: str,
    email: str,
    current_user=Depends(require_roles("club_admin", "federation_admin")),
):
    """Unregister a student from an activity"""
    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is signed up
    if email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    # Remove student
    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
