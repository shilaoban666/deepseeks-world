import bpy, os, sys
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 92
try:
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
out = os.environ.get("GALLERY_OUT")
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("RENDERED", out, round(os.path.getsize(out) / 1024), "KB")
