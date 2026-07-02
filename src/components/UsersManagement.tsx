import React, { useState, useEffect } from "react";
import { 
  User as UserIcon, 
  Key, 
  Check, 
  AlertCircle, 
  Loader2, 
  UserPlus, 
  Users, 
  Shield, 
  RefreshCw 
} from "lucide-react";

interface UserProfile {
  mobile: string;
  role: 'admin' | 'employee';
}

interface UsersManagementProps {
  currentUserMobile: string | null;
  currentUserRole: string | null;
}

export default function UsersManagement({ currentUserMobile, currentUserRole }: UsersManagementProps) {
  // Main lists
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  
  // Registration form
  const [newMobile, setNewMobile] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [newRole, setNewRole] = useState<'admin' | 'employee'>("employee");
  
  // States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchUsers = async () => {
    if (currentUserRole !== "admin") return;
    setIsLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error("Failed to load users", err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentUserRole]);

  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!newMobile || !newPassword) {
      setErrorMessage("Please fill in both the mobile number and password.");
      return;
    }

    if (newPassword !== newConfirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          mobile: newMobile, 
          password: newPassword, 
          role: newRole 
        }),
      });

      if (res.ok) {
        setSuccessMessage(`Account ${newMobile} saved successfully!`);
        setNewMobile("");
        setNewPassword("");
        setNewConfirmPassword("");
        fetchUsers();
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error || "Failed to save user info.");
      }
    } catch (err) {
      setErrorMessage("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" id="users-management-page">
      {/* Page header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">System User & Auth Management</h1>
        <p className="text-xs text-slate-500 font-medium">Configure administrator credentials, employee login pins, and security profiles.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Registration and edit form */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center mb-2">
            <UserPlus className="h-5 w-5 mr-1.5 text-indigo-500" />
            Register / Edit User Profile
          </h3>

          {errorMessage && (
            <div className="p-3.5 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-100 flex items-center space-x-2 animate-fade-in">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-100 flex items-center space-x-2 animate-fade-in">
              <Check className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleCreateOrUpdateUser} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="u-mobile">Username (Mobile Number)</label>
              <input
                id="u-mobile"
                type="text"
                placeholder="e.g. 1234567890"
                value={newMobile}
                onChange={(e) => setNewMobile(e.target.value)}
                className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-mono"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="u-password">Password / Pin</label>
                <input
                  id="u-password"
                  type="password"
                  placeholder="••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="u-confirm">Confirm Password</label>
                <input
                  id="u-confirm"
                  type="password"
                  placeholder="••••••"
                  value={newConfirmPassword}
                  onChange={(e) => setNewConfirmPassword(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="u-role">Privilege Role</label>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    checked={newRole === "employee"}
                    onChange={() => setNewRole("employee")}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Employee (Print-Only Access)</span>
                </label>
                <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    checked={newRole === "admin"}
                    onChange={() => setNewRole("admin")}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Administrator (Full Setup Access)</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newMobile || !newPassword}
              className="inline-flex items-center justify-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-100 w-full md:w-auto"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>Save Credentials</span>
            </button>
          </form>
        </div>

        {/* Users list for administrators */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-700 flex items-center">
              <Users className="h-5 w-5 mr-1.5 text-slate-400" />
              Registered Accounts
            </h3>
            <button 
              onClick={fetchUsers}
              className="p-1 text-slate-400 hover:text-indigo-600 transition-all rounded"
              title="Refresh Accounts"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingUsers ? "animate-spin" : ""}`} />
            </button>
          </div>

          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-xs font-bold">Synchronizing account database...</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[350px]">
              {usersList.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <UserIcon className="h-10 w-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-bold">No other accounts fetched</p>
                </div>
              ) : (
                usersList.map((user) => (
                  <div key={user.mobile} className="py-3 flex items-center justify-between font-sans">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
                        <UserIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 font-mono">{user.mobile}</p>
                        <p className="text-[10px] text-slate-400 font-bold flex items-center mt-0.5">
                          <Shield className="h-3 w-3 mr-1 text-slate-400" />
                          {user.role}
                        </p>
                      </div>
                    </div>

                    {user.mobile === currentUserMobile && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] rounded-md font-bold border border-indigo-100">
                        You
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
