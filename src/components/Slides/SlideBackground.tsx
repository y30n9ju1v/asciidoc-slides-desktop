import { useSlideImageUrl } from './useSlideImageUrl';

export function SlideBackground({ path }: { path: string }) {
  const image = useSlideImageUrl({ kind: 'document-relative', relativePath: path });
  if (!image.url)
    return (
      <span className="slide-background-error" role="status">
        {image.error ? `Background: ${image.error}` : 'Loading background…'}
      </span>
    );
  return <img className="slide-background-image" src={image.url} alt="" />;
}
