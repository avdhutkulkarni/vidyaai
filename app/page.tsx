"use client";
import { auth, provider } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-5xl font-bold text-blue-700 mb-2">VidyaAi</h1>
        <p className="text-gray-500 mb-8">Smart Learning for Maharashtra Board Students</p>
        <button
          onClick={handleLogin}
          className="bg-blue-600 text-white px-8 py-3 rounded-full text-lg font-semibold hover:bg-blue-700"
        >
          Login with Google
        </button>
      </div>
    </div>
  );
}