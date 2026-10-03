"""Encode one generated artwork as a seamless, silent 30-second camera loop.
Usage: python3 scripts/media/render-hero.py /path/to/ffmpeg
The encoder is a build-time tool; the website serves a regular MP4.
"""
import pathlib
import subprocess
import sys
root = pathlib.Path(__file__).resolve().parents[2]
subprocess.run([
    sys.argv[1] if len(sys.argv) > 1 else 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(root / 'public/images/hero/blue-collage.webp'),
    '-vf', "scale=2304:1536,zoompan=z='1+0.045*(1-cos(2*PI*on/720))/2':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=720:s=1200x800:fps=24,format=yuv420p",
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-movflags', '+faststart',
    str(root / 'public/images/hero/blue-collage-loop.mp4'),
], check=True)
