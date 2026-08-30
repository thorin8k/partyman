import { Link, Route, Switch } from "wouter";

function Home() {
  return (
    <div className="container">
      <h1>Partyman</h1>
      <p>Self-hosted LAN party companion.</p>
      <div className="card">
        <p>Bootstrap is running. Domain features are added in later tasks.</p>
        <ul>
          <li>
            <Link href="/">Public display (placeholder)</Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route>
        <div className="container">
          <h1>Not found</h1>
        </div>
      </Route>
    </Switch>
  );
}
