import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFloor, createProject, addPhoto, updatePhoto, deleteEntity, addRectRoom, parseProject, migrateProject } from '../src/index';
import { GeometryError } from '../../shared-types/src/index';

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

test('a photo is pinned where it was taken, and keeps what it documents', () => {
  const { floor: f0, roomId } = addRectRoom(createFloor('F'), { x: 0, y: 0, width: 4, length: 3.5 });
  const { floor, id } = addPhoto(f0, { name: '', dataUrl: JPEG, x: 1.2345678912345, y: 2, subjectId: roomId, note: 'socket behind the door' });
  const p = floor.photos[id];
  assert.equal(p.name, 'Photo 1');          // named for you if you do not
  assert.equal(p.x, 1.234567891);           // stored at the plan's precision
  assert.equal(p.subjectId, roomId);
  assert.ok(Date.parse(p.takenAt) > 0);
  assert.equal(Object.keys(f0.photos).length, 0); // the input floor is untouched
});

test('photos are renamed, annotated and deleted like anything else on the plan', () => {
  const { floor, id } = addPhoto(createFloor('F'), { name: 'Kitchen', dataUrl: JPEG, x: 0, y: 0, subjectId: null, note: '' });
  const named = updatePhoto(floor, id, { note: 'crack above the window' });
  assert.equal(named.photos[id].note, 'crack above the window');
  assert.equal(named.photos[id].name, 'Kitchen');
  assert.equal(Object.keys(deleteEntity(named, id).photos).length, 0);
  assert.throws(() => updatePhoto(floor, 'nope', { note: 'x' }), (e: GeometryError) => e.code === 'missing');
  assert.throws(() => addPhoto(floor, { name: '', dataUrl: '', x: 0, y: 0, subjectId: null, note: '' }), (e: GeometryError) => e.code === 'photo');
});

test('photos travel with the project, and older projects load without them', () => {
  const { floor, id } = addPhoto(createFloor('F'), { name: 'Hall', dataUrl: JPEG, x: 1, y: 2, subjectId: null, note: 'n' });
  const p = createProject('P');
  const saved = JSON.parse(JSON.stringify({ ...p, floors: [floor] }));
  const back = parseProject(saved);
  assert.equal(back.floors[0].photos[id].dataUrl, JPEG);
  assert.equal(back.floors[0].photos[id].note, 'n');
  const old = JSON.parse(JSON.stringify({ ...p, floors: [floor] }));
  delete old.floors[0].photos;
  assert.deepEqual(migrateProject(old).floors[0].photos, {});
});
