import { getDict } from "@/lib/i18n";
import { NotFoundPage } from "@/components/states";

export default async function NotFound() {
  const { t, dir } = await getDict();
  return (
    <div dir={dir}>
      <NotFoundPage title={t.states.notFound.title} body={t.states.notFound.body} home={t.states.notFound.home} />
    </div>
  );
}
