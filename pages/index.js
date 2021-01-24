import useSWR from "swr";

const fetcher = (url) => fetch(url).then((res) => res.text());

const Index = () => {
  const { data, error } = useSWR("/api/hello", fetcher);

  if (error) return <div>Failed to load</div>;
  if (!data) return <div>Loading...</div>;

  return <div>{`Cookie from response: "${data}"`}</div>;
};

export default Index;
