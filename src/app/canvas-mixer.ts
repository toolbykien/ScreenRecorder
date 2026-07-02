import { APP_CONFIG } from './constants';

export interface CameraOverlayConfig {
  isCameraEnabled: boolean;
  cameraPos: { x: number; y: number };
  cameraSize: number;
  cameraShape?: 'circle' | 'rectangle';
  windowWidth: number;
  windowHeight: number;
  showBorder?: boolean;
  borderColor?: string;
  zoomScale?: number;
  zoomCenter?: { x: number; y: number };
}

export class CanvasMixer {
  /**
   * Draws the screen sharing frames and composites the webcam feeds onto the target canvas ctx.
   */
  static drawFrame(
    canvasCtx: CanvasRenderingContext2D,
    canvasEle: HTMLCanvasElement,
    displayVideo: HTMLVideoElement,
    camVideoEl: HTMLVideoElement | null,
    config: CameraOverlayConfig
  ) {
    try {
      // 1. Render the main display background (with zoom support)
      if (config.zoomScale && config.zoomScale > 1 && config.zoomCenter) {
        canvasCtx.save();
        const cx = config.zoomCenter.x * canvasEle.width;
        const cy = config.zoomCenter.y * canvasEle.height;
        canvasCtx.translate(cx, cy);
        canvasCtx.scale(config.zoomScale, config.zoomScale);
        canvasCtx.translate(-cx, -cy);
        canvasCtx.drawImage(displayVideo, 0, 0, canvasEle.width, canvasEle.height);
        canvasCtx.restore();
      } else {
        canvasCtx.drawImage(displayVideo, 0, 0, canvasEle.width, canvasEle.height);
      }

      // 2. Overlay camera shape if enabled and ready
      if (config.isCameraEnabled && camVideoEl && camVideoEl.readyState >= 2) {
        const windowW = config.windowWidth || APP_CONFIG.CONSTRAINTS.MAX_RESOLUTION;
        const windowH = config.windowHeight || 1080;

        const scaleX = canvasEle.width / windowW;
        const scaleY = canvasEle.height / windowH;
        
        // Để camera tỉ lệ thuận với màn hình mà không bị méo hoặc quá to
        const scale = Math.min(scaleX, scaleY);
        
        const isCircle = (config.cameraShape || 'circle') === 'circle';
        const targetW = config.cameraSize * scale;
        const targetH = isCircle ? targetW : (targetW * 9 / 16);
        const camRadius = targetW / 2;

        const leftPadding = config.cameraPos.x;
        const rightPadding = windowW - (config.cameraPos.x + config.cameraSize);
        const topPadding = config.cameraPos.y;
        
        const logicalCamH = isCircle ? config.cameraSize : (config.cameraSize * 9 / 16);
        const bottomPadding = windowH - (config.cameraPos.y + logicalCamH);

        let x = 0;
        let y = 0;

        // Bám theo lề gần nhất để đảm bảo lề hiển thị trên canvas giống hệt trên trình duyệt
        if (leftPadding < rightPadding) {
            x = leftPadding * scale;
        } else {
            x = canvasEle.width - (rightPadding * scale) - targetW;
        }

        if (topPadding < bottomPadding) {
            y = topPadding * scale;
        } else {
            y = canvasEle.height - (bottomPadding * scale) - targetH;
        }

        // Clamp một lần nữa để chắc chắn camera không bị văng ra khỏi map khi scale có sai số
        x = Math.max(0, Math.min(x, canvasEle.width - targetW));
        y = Math.max(0, Math.min(y, canvasEle.height - targetH));

        canvasCtx.save();
        canvasCtx.beginPath();
        if (isCircle) {
            canvasCtx.arc(x + camRadius, y + camRadius, camRadius, 0, Math.PI * 2);
        } else {
            const borderRadius = 12 * scale;
            if (typeof canvasCtx.roundRect === 'function') {
                canvasCtx.roundRect(x, y, targetW, targetH, borderRadius);
            } else {
                canvasCtx.rect(x, y, targetW, targetH);
            }
        }
        canvasCtx.closePath();
        canvasCtx.clip();

        const vW = camVideoEl.videoWidth;
        const vH = camVideoEl.videoHeight;
        const aspect = vW / vH;
        let sW = vW;
        let sH = vH;

        if (isCircle) {
            // Circle crop (1:1 ratio)
            if (aspect > 1) {
              sW = vH;
            } else {
              sH = vW;
            }
        } else {
            // Rectangle crop (16:9 ratio)
            const targetAspect = 16 / 9;
            if (aspect > targetAspect) {
              sW = vH * targetAspect;
            } else {
              sH = vW / targetAspect;
            }
        }

        // Mirror camera preview
        canvasCtx.translate(x + targetW / 2, y + targetH / 2);
        canvasCtx.scale(-1, 1);
        canvasCtx.translate(-(x + targetW / 2), -(y + targetH / 2));

        canvasCtx.drawImage(
          camVideoEl,
          (vW - sW) / 2,
          (vH - sH) / 2,
          sW,
          sH,
          x,
          y,
          targetW,
          targetH
        );

        canvasCtx.restore();

        // Stroke rounded boundary (only if showBorder is enabled)
        if (config.showBorder) {
          canvasCtx.save();
          canvasCtx.beginPath();
          if (isCircle) {
            canvasCtx.arc(x + camRadius, y + camRadius, camRadius, 0, Math.PI * 2);
          } else {
            const borderRadius = 12 * scale;
            if (typeof canvasCtx.roundRect === 'function') {
                canvasCtx.roundRect(x, y, targetW, targetH, borderRadius);
            } else {
                canvasCtx.rect(x, y, targetW, targetH);
            }
          }
          canvasCtx.lineWidth = 2 * scale;
          canvasCtx.strokeStyle = config.borderColor || 'rgba(16, 185, 129, 0.8)';
          canvasCtx.stroke();
          canvasCtx.restore();
        }
      }
    } catch {
      // Guard silently during stream transitions
    }
  }
}
