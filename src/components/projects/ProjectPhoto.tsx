type ProjectPhotoProps = {
  imagePath: string | null;
  name: string;
};

export function ProjectPhoto({ imagePath, name }: ProjectPhotoProps) {
  if (imagePath && /^https?:\/\//i.test(imagePath)) {
    return <img className="project-photo" src={imagePath} alt="" />;
  }
  return (
    <div className="project-photo photo-placeholder" aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
