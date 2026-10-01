declare module 'cdt2d' {
  interface Cdt2dOptions {
    delaunay?: boolean;
    interior?: boolean;
    exterior?: boolean;
    infinity?: boolean;
  }
  function cdt2d(points: number[][], edges?: number[][], options?: Cdt2dOptions): number[][];
  export = cdt2d;
}
