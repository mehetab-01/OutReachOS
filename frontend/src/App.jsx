import { AppProvider, useApp } from "./context/AppContext";
import TopNav from "./components/TopNav";
import ImportScreen from "./screens/ImportScreen";
import ConfigureScreen from "./screens/ConfigureScreen";
import GenerateScreen from "./screens/GenerateScreen";
import ReviewScreen from "./screens/ReviewScreen";
import SendScreen from "./screens/SendScreen";
import LandingPage from "./screens/LandingPage";
import AuthScreen from "./screens/AuthScreen";
import NotFoundScreen from "./screens/NotFoundScreen";
import { Toaster } from "./components/ui/toaster";

const SCREENS = {
  import: ImportScreen,
  configure: ConfigureScreen,
  generate: GenerateScreen,
  review: ReviewScreen,
  send: SendScreen,
};

function Router() {
  const { screen, setScreen, firebaseUser, setFirebaseUser, authLoading } = useApp();

  // Firebase auth still initialising — show nothing to avoid flash
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold animate-pulse">O</div>
      </div>
    );
  }

  // Landing page — always accessible
  if (screen === "home") {
    return (
      <>
        <LandingPage onGetStarted={() => setScreen(firebaseUser ? "import" : "auth")} />
        <Toaster />
      </>
    );
  }

  // Auth gate — not signed in
  if (!firebaseUser) {
    return (
      <>
        <AuthScreen onAuth={(user) => { setFirebaseUser(user); setScreen("import"); }} />
        <Toaster />
      </>
    );
  }

  const Screen = SCREENS[screen];

  if (!Screen) {
    return (
      <>
        <NotFoundScreen onBack={() => setScreen("import")} />
        <Toaster />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <main className="max-w-[1200px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div key={screen} className="animate-fade-in">
          <Screen />
        </div>
      </main>
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
