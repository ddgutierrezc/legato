Pod::Spec.new do |s|
  s.name = 'CapacitorLegato'
  s.version = '0.1.0'
  s.summary = 'Capacitor binding MVP for Legato.'
  s.license = 'MIT'
  s.homepage = 'https://github.com/legato/legato'
  s.author = 'Legato'
  s.source = { :git => 'https://github.com/legato/legato.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
end
