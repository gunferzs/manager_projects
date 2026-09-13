import type { ServiceRowModel } from "../../lib/projects/present";

function probeText(ok: boolean | null): string {
  if (ok === true) return "ок";
  if (ok === false) return "ошибка";
  return "нет данных";
}

export function ServiceTable({ services }: { services: ServiceRowModel[] }) {
  if (services.length === 0) {
    return <p>Сервисы не заданы.</p>;
  }
  return (
    <table className="service-table">
      <thead>
        <tr>
          <th>Сервис</th>
          <th>Порт</th>
          <th>Проба</th>
        </tr>
      </thead>
      <tbody>
        {services.map((service) => (
          <tr key={service.name}>
            <td>{service.name}</td>
            <td>{service.port ?? "—"}</td>
            <td>{probeText(service.probeOk)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
