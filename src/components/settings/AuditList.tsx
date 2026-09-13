type AuditRow = {
  id: number;
  at: string;
  action: string;
  ip: string;
  outcome: "ok" | "fail";
};

export function AuditList({ events }: { events: AuditRow[] }) {
  if (events.length === 0) {
    return <p>Событий пока нет.</p>;
  }

  return (
    <table className="service-table">
      <thead>
        <tr>
          <th>Время</th>
          <th>Действие</th>
          <th>IP</th>
          <th>Результат</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <td>{event.at}</td>
            <td>{event.action}</td>
            <td>{event.ip || "—"}</td>
            <td>{event.outcome === "ok" ? "ok" : "ошибка"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
