"use client";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/");
      } else {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-blue-700">VidyaAi Dashboard</h1>
          <button onClick={handleLogout} className="bg-red-500 text-white px-4 py-2 rounded-lg">
            Logout
          </button>
        </div>
        <p className="text-gray-600 mb-6">Welcome, {user.displayName}! 👋</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-semibold text-blue-600">⚡ Electrostatics</h2>
            <p className="text-gray-500 mt-2">Class 12 Physics</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-semibold text-green-600">🔗 Chemical Bonding</h2>
            <p className="text-gray-500 mt-2">Class 12 Chemistry</p>
          </div>
        </div>
      </div>
    </div>
  );
}