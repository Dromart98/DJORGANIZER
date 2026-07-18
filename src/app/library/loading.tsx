export default function LibraryLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando biblioteca" className="library-loading">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--filters" />
      <div className="skeleton skeleton--table" />
    </div>
  );
}
