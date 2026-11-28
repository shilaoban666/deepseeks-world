import bpy
print('FILE', bpy.data.filepath)
print('OBJECTS', len(bpy.data.objects))
print('MESH', len([o for o in bpy.data.objects if o.type == 'MESH']))
print('TEXT', len([o for o in bpy.data.objects if o.type == 'FONT']))
print('CAMERA', [o.name for o in bpy.data.objects if o.type == 'CAMERA'])
print('COLLECTIONS', [c.name for c in bpy.context.scene.collection.children])
print('SAMPLE', [o.name for o in bpy.data.objects if o.type == 'MESH'][:6])
