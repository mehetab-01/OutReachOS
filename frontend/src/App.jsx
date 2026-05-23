import { AppProvider, useApp } from "./context/AppContext";
import TopNav from "./components/TopNav";
import ImportScreen from "./screens/ImportScreen";
import ConfigureScreen from "./screens/ConfigureScreen";
import GenerateScreen from "./screens/GenerateScreen";
import ReviewScreen from "./screens/ReviewScreen";
import SendScreen from "./screens/SendScreen";
import { Toaster } from "./components/ui/toaster";

const SCREENS = {
  import: ImportScreen,
  configure: ConfigureScreen,
  generate: GenerateScreen,
  review: ReviewScreen,
  send: SendScreen,
};

function Router() {
  const { screen } = useApp();
  const Screen = SCREENS[screen] || ImportScreen;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
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
